#include <gio/gio.h>
#include <glib-unix.h>
#include <gtk/gtk.h>
#include <json-glib/json-glib.h>
#include <libsoup/soup.h>
#include <webkit2/webkit2.h>

#include <stdlib.h>
#include <signal.h>
#include <string.h>

typedef struct {
  GtkApplication *app;
  GtkWindow *window;
  GSubprocess *server;
  char *root;
  char *api_url;
  char *ui_url;
  int port;
} Cadence;

static gboolean api_request(Cadence *state, const char *method, const char *path,
                            const char *body, char **response_body) {
  SoupSession *session = soup_session_new_with_options("timeout", 1, NULL);
  char *url = g_strconcat(state->api_url, path, NULL);
  SoupMessage *message = soup_message_new(method, url);
  GError *error = NULL;
  GBytes *bytes = NULL;
  gboolean ok = FALSE;

  if (body) {
    GBytes *request = g_bytes_new(body, strlen(body));
    soup_message_set_request_body_from_bytes(message, "application/json", request);
    g_bytes_unref(request);
  }
  bytes = soup_session_send_and_read(session, message, NULL, &error);
  if (bytes && soup_message_get_status(message) >= 200 && soup_message_get_status(message) < 300) {
    if (response_body) *response_body = g_strndup(g_bytes_get_data(bytes, NULL), g_bytes_get_size(bytes));
    ok = TRUE;
  }
  if (error) g_error_free(error);
  if (bytes) g_bytes_unref(bytes);
  g_object_unref(message);
  g_object_unref(session);
  g_free(url);
  return ok;
}

static gboolean cadence_ready(Cadence *state) {
  char *body = NULL;
  gboolean ok = api_request(state, "GET", "/api/ping", NULL, &body);
  JsonParser *parser = json_parser_new();
  gboolean cadence = FALSE;
  if (ok && body && json_parser_load_from_data(parser, body, -1, NULL)) {
    JsonNode *root = json_parser_get_root(parser);
    if (JSON_NODE_HOLDS_OBJECT(root)) {
      JsonObject *object = json_node_get_object(root);
      cadence = json_object_has_member(object, "app") &&
                g_strcmp0(json_object_get_string_member(object, "app"), "cadence") == 0;
    }
  }
  g_object_unref(parser);
  g_free(body);
  return cadence;
}

static gboolean port_in_use(Cadence *state) {
  GSocketClient *client = g_socket_client_new();
  g_socket_client_set_timeout(client, 1);
  GSocketConnection *connection = g_socket_client_connect_to_host(client, "127.0.0.1", state->port, NULL, NULL);
  gboolean used = connection != NULL;
  if (connection) g_object_unref(connection);
  g_object_unref(client);
  return used;
}

static gboolean ensure_server(Cadence *state) {
  gboolean dev = g_strcmp0(g_getenv("CADENCE_DEV"), "1") == 0;
  if (dev) {
    for (int i = 0; i < 100; ++i) {
      if (cadence_ready(state)) return TRUE;
      g_usleep(100000);
    }
  }
  if (cadence_ready(state)) return TRUE;
  if (port_in_use(state)) {
    g_printerr("Cadence: port %d is used by another service\n", state->port);
    return FALSE;
  }

  char *bundle = g_build_filename(state->root, "dist-server", "standalone.mjs", NULL);
  if (!g_file_test(bundle, G_FILE_TEST_IS_REGULAR)) {
    g_printerr("Cadence: missing server bundle. Run npm run build:native.\n");
    g_free(bundle);
    return FALSE;
  }
  GSubprocessLauncher *launcher = g_subprocess_launcher_new(G_SUBPROCESS_FLAGS_NONE);
  char *dist = g_build_filename(state->root, "dist", NULL);
  char *port = g_strdup_printf("%d", state->port);
  g_subprocess_launcher_set_cwd(launcher, state->root);
  g_subprocess_launcher_setenv(launcher, "DIST_DIR", dist, TRUE);
  g_subprocess_launcher_setenv(launcher, "CADENCE_PORT", port, TRUE);
  g_subprocess_launcher_setenv(launcher, "NODE_ENV", "production", TRUE);
  g_subprocess_launcher_unsetenv(launcher, "CADENCE_DEV");
  GError *error = NULL;
  state->server = g_subprocess_launcher_spawn(launcher, &error, "node", bundle, NULL);
  g_object_unref(launcher);
  g_free(bundle);
  g_free(dist);
  g_free(port);
  if (!state->server) {
    g_printerr("Cadence: could not start server: %s\n", error->message);
    g_error_free(error);
    return FALSE;
  }
  for (int i = 0; i < 60; ++i) {
    if (cadence_ready(state)) return TRUE;
    g_usleep(100000);
  }
  g_printerr("Cadence: server did not become ready\n");
  return FALSE;
}

static gboolean decide_policy(WebKitWebView *view, WebKitPolicyDecision *decision,
                              WebKitPolicyDecisionType type, gpointer data) {
  (void)view;
  Cadence *state = data;
  if (type != WEBKIT_POLICY_DECISION_TYPE_NAVIGATION_ACTION &&
      type != WEBKIT_POLICY_DECISION_TYPE_NEW_WINDOW_ACTION) return FALSE;
  WebKitNavigationAction *action = webkit_navigation_policy_decision_get_navigation_action(
      WEBKIT_NAVIGATION_POLICY_DECISION(decision));
  const char *uri = webkit_uri_request_get_uri(webkit_navigation_action_get_request(action));
  size_t base_length = strlen(state->ui_url);
  if (g_str_has_prefix(uri, state->ui_url) &&
      (uri[base_length] == '\0' || uri[base_length] == '/')) {
    if (type == WEBKIT_POLICY_DECISION_TYPE_NAVIGATION_ACTION) {
      WebKitWebsitePolicies *policies = webkit_website_policies_new_with_policies(
          "autoplay", WEBKIT_AUTOPLAY_ALLOW, NULL);
      webkit_policy_decision_use_with_policies(decision, policies);
      g_object_unref(policies);
    } else {
      webkit_policy_decision_use(decision);
    }
    return TRUE;
  }

  webkit_policy_decision_ignore(decision);
  if (g_str_has_prefix(uri, "https://") || g_str_has_prefix(uri, "http://"))
    g_app_info_launch_default_for_uri(uri, NULL, NULL);
  return TRUE;
}

static gboolean deny_permission(WebKitWebView *view, WebKitPermissionRequest *request, gpointer data) {
  (void)view;
  (void)data;
  webkit_permission_request_deny(request);
  return TRUE;
}

static void activate(GApplication *app, gpointer data) {
  Cadence *state = data;
  if (state->window) {
    gtk_window_present(state->window);
    return;
  }
  if (!ensure_server(state)) {
    g_application_quit(app);
    return;
  }

  WebKitWebContext *context = webkit_web_context_get_default();
  webkit_web_context_set_cache_model(context, WEBKIT_CACHE_MODEL_DOCUMENT_VIEWER);
  WebKitUserContentManager *manager = webkit_user_content_manager_new();
  WebKitUserStyleSheet *style = webkit_user_style_sheet_new(
      ".cadence-window-controls { display: none !important; }",
      WEBKIT_USER_CONTENT_INJECT_ALL_FRAMES, WEBKIT_USER_STYLE_LEVEL_USER, NULL, NULL);
  webkit_user_content_manager_add_style_sheet(manager, style);
  webkit_user_style_sheet_unref(style);
  WebKitWebView *view = WEBKIT_WEB_VIEW(webkit_web_view_new_with_user_content_manager(manager));
  g_object_unref(manager);
  WebKitSettings *settings = webkit_web_view_get_settings(view);
  webkit_settings_set_media_playback_requires_user_gesture(settings, FALSE);
  webkit_settings_set_enable_webaudio(settings, TRUE);
  g_signal_connect(view, "decide-policy", G_CALLBACK(decide_policy), state);
  g_signal_connect(view, "permission-request", G_CALLBACK(deny_permission), NULL);

  state->window = GTK_WINDOW(gtk_application_window_new(state->app));
  gtk_window_set_title(state->window, "Cadence");
  gtk_window_set_default_size(state->window, 1600, 900);
  gtk_widget_set_size_request(GTK_WIDGET(state->window), 1024, 650);
  gtk_container_add(GTK_CONTAINER(state->window), GTK_WIDGET(view));

  state->ui_url = g_strdup_printf("http://localhost:%d", state->port);
  if (g_strcmp0(g_getenv("CADENCE_DEV"), "1") == 0) {
    for (int i = 0; i < 100; ++i) {
      SoupSession *session = soup_session_new_with_options("timeout", 1, NULL);
      SoupMessage *message = soup_message_new("GET", "http://localhost:5173");
      GBytes *bytes = soup_session_send_and_read(session, message, NULL, NULL);
      gboolean ready = bytes && soup_message_get_status(message) == SOUP_STATUS_OK;
      if (bytes) g_bytes_unref(bytes);
      g_object_unref(message);
      g_object_unref(session);
      if (ready) {
        g_free(state->ui_url);
        state->ui_url = g_strdup("http://localhost:5173");
        break;
      }
      g_usleep(100000);
    }
  }
  webkit_web_view_load_uri(view, state->ui_url);
  gtk_widget_show_all(GTK_WIDGET(state->window));
}

static int command_line(GApplication *app, GApplicationCommandLine *command, gpointer data) {
  Cadence *state = data;
  int argc = 0;
  char **argv = g_application_command_line_get_arguments(command, &argc);
  g_application_activate(app);
  for (int i = 1; i + 1 < argc; ++i) {
    if (g_strcmp0(argv[i], "--play") == 0 || g_strcmp0(argv[i], "-p") == 0) {
      JsonBuilder *builder = json_builder_new();
      json_builder_begin_object(builder);
      json_builder_set_member_name(builder, "action");
      json_builder_add_string_value(builder, "play");
      json_builder_set_member_name(builder, "query");
      json_builder_add_string_value(builder, argv[i + 1]);
      json_builder_end_object(builder);
      JsonGenerator *generator = json_generator_new();
      JsonNode *root = json_builder_get_root(builder);
      json_generator_set_root(generator, root);
      char *body = json_generator_to_data(generator, NULL);
      if (!api_request(state, "POST", "/api/ctl/playback", body, NULL))
        g_printerr("Cadence: play command failed\n");
      g_free(body);
      json_node_unref(root);
      g_object_unref(generator);
      g_object_unref(builder);
      break;
    }
  }
  g_strfreev(argv);
  return 0;
}

static void shutdown_app(GApplication *app, gpointer data) {
  (void)app;
  Cadence *state = data;
  if (state->server) {
    g_subprocess_force_exit(state->server);
    g_subprocess_wait(state->server, NULL, NULL);
    g_object_unref(state->server);
    state->server = NULL;
  }
}

static gboolean quit_on_signal(gpointer data) {
  g_application_quit(G_APPLICATION(data));
  return G_SOURCE_REMOVE;
}

int main(int argc, char **argv) {
  Cadence state = {0};
  char *binary = g_file_read_link("/proc/self/exe", NULL);
  char *native_dir = g_path_get_dirname(binary ? binary : argv[0]);
  state.root = g_path_get_dirname(native_dir);
  state.port = 3001;
  const char *configured_port = g_getenv("CADENCE_PORT");
  if (configured_port) {
    char *end = NULL;
    long value = strtol(configured_port, &end, 10);
    if (end != configured_port && *end == '\0' && value > 0 && value < 65536) state.port = value;
  }
  state.api_url = g_strdup_printf("http://127.0.0.1:%d", state.port);
  state.app = gtk_application_new("io.github.drnzy.cadence", G_APPLICATION_HANDLES_COMMAND_LINE);
  g_signal_connect(state.app, "activate", G_CALLBACK(activate), &state);
  g_signal_connect(state.app, "command-line", G_CALLBACK(command_line), &state);
  g_signal_connect(state.app, "shutdown", G_CALLBACK(shutdown_app), &state);
  g_unix_signal_add(SIGINT, quit_on_signal, state.app);
  g_unix_signal_add(SIGTERM, quit_on_signal, state.app);
  int status = g_application_run(G_APPLICATION(state.app), argc, argv);
  g_object_unref(state.app);
  g_free(state.api_url);
  g_free(state.ui_url);
  g_free(state.root);
  g_free(native_dir);
  g_free(binary);
  return status;
}
