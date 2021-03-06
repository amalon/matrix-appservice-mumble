# matrix-appservice-mumble

A simple Matrix to Mumble bridge. It sends messages between bridged rooms and tells you when people join / leave Murmur.

## Install


### Compiling Murmur with gRPC support

Murmur is not compiled with gRPC support by default (as of 1.3.0). If you are using Fedora or CentOS, I have a [COPR](https://copr.fedorainfracloud.org/coprs/mymindstorm/mumble-grpc/) that you can use. Otherwise, you will need to compile Murmur yourself. I have some basic notes and directions on compiling Murmur [here](COMPILING_MURMUR.md).

### Setup bridge

1. Install

    Using npm:
    ```bash
    npm install --global matrix-appservice-mumble
    ```

    Manually:

    [Download a release](https://github.com/mymindstorm/matrix-appservice-mumble/releases) and build

    ```bash
    npm i
    ./build.sh
    ```
2. Configure your homeserver
    1. Generate `mumble-registration.yaml`

    ```bash
    # Replace "http://localhost:port" with the address your homeserver will use to talk
    # with matrix-appservice-mumble. The port matrix-appservice-mumble uses can be set with -p.
    matrix-appservice-mumble -r -u "http://localhost:port"
    ```

    2. Copy `mumble-registration.yaml` to homeserver

    3. Edit `homeserver.yaml`

    ```yaml
    # A list of application service config files to use
    #
    app_service_config_files:
    - mumble-config.yaml
    ```

4. Fill out `mumble-config.yaml`. Look at the `mumble-config.yaml.example` file for an example.

5. `matrix-appservice-mumble -c ./mumble-config.yaml -f ./mumble-registration.yaml`

### Troubleshooting

#### Matrix -> Murmr not working

- Can you curl `url` in `mumble-config.yaml` from the homeserver?
    - Check firewall configuration
    - Check if matrix-appservice-mumble is running
    - Check logs
    - Check `mumble-registration.yaml` on both sides (should be in working directory of matrix-appservice-mumble and on homeserver)
