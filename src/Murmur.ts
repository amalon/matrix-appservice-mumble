import { loadPackageDefinition, credentials } from 'grpc';
import { MurmurClient, MurmurServer, MurmurChannel, MurmurConfig, MessageEvent } from './types';
import * as protoLoader from '@grpc/proto-loader';

export default class Murmur {
  private addr: string;
  private server: MurmurServer | undefined;
  private gotChannels: Promise<boolean> | undefined;
  private channels: MurmurChannel[];
  private channel_ids: number[];
  private matrixClient: any;
  client: MurmurClient | undefined;

  constructor(addr: string) {
    this.addr = addr;
    this.channels = [];
    this.channel_ids = [];
    return;
  }

  // Init connection
  connectClient() {
    return new Promise((resolve) => {
      const pkgDef = protoLoader.loadSync(
        __dirname + '/MurmurRPC.proto',
        {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
        });
      const MurmurRPC = loadPackageDefinition(pkgDef).MurmurRPC;
      // @ts-ignore
      const client = new MurmurRPC.V1(
        this.addr,
        credentials.createInsecure()) as MurmurClient;
      client.waitForReady(Infinity, (err) => {
        if (err) {
          console.log(err);
          process.exit(1);
        }
        this.client = client;
        resolve();
      });
    });
  }

  // Sets server to the first running one and returns server stream
  getServerStream() {
    return new Promise((resolve) => {
      if (!this.client) {
        console.log("Murmur client connection null!");
        process.exit(1);
      }

      this.client.serverQuery({}, (e, r) => {
        if (!this.client) {
          console.log("Murmur client connection null!");
          process.exit(1);
        }

        if (e) {
          console.log(e);
          process.exit(1);
        } else if (r) {
          let server;
          for (const currentServer of r.servers) {
            if (currentServer.running) {
              server = currentServer;
              break;
            }
          }

          if (!server) {
            console.log('No servers running!');
            process.exit(1);
            return;
          }

          this.server = server;
          resolve(this.client.serverEvents(this.server));
        }
      });
    });
  }

  getServerChannels(config: MurmurConfig) {
    return new Promise<boolean>((resolve) => {
      if (!config.channels) {
        resolve(true);
      }
      if (!this.client) {
        console.log("Murmur client connection null!");
        process.exit(1);
      }

      if (!this.server) {
        console.log('Not got server yet!');
        process.exit(1);
      }

      this.client.channelQuery({server: this.server}, (e, r) => {
        if (!this.client) {
          console.log("Murmur client connection null!");
          process.exit(1);
        }

        if (e) {
          console.log(e);
          process.exit(1);
        } else if (r) {
          for (const channel of r.channels) {
            if (!channel.name || !channel.id) {
              continue;
            }
            if (config.channels && config.channels.includes(channel.name)) {
              console.log("Found channel '%s' with id '%s'", channel.name, channel.id);
              this.channels.push(channel);
              this.channel_ids.push(channel.id);
            }
          }
          if (config.channels && this.channels.length != config.channels.length) {
            if (this.channels.length) {
              console.log("WARNING: Not all channels in config were found.");
            } else {
              console.log("WARNING: No channels in config were found.");
              process.exit(1);
            }
          }

          resolve(true);
        }
      });
    });
  }

  async setupCallbacks(bridge: any, config: MurmurConfig) {
    const stream = await this.getServerStream() as NodeJS.ReadableStream;
    this.gotChannels = this.getServerChannels(config);
    stream.on('data', async (chunk) => {
      switch (chunk.type) {
        case 'UserConnected':
          const connIntent = bridge.getIntent();
          connIntent.sendMessage(config.matrixRoom, {
            body: `${chunk.user.name} has connected to the server.`,
            msgtype: "m.notice"
          });
          break;
        case 'UserDisconnected':
          const disconnIntent = bridge.getIntent();
          disconnIntent.sendMessage(config.matrixRoom, {
            body: `${chunk.user.name} has disconnected from the server.`,
            msgtype: "m.notice"
          });
          break;
        case 'UserTextMessage':
          // is this a message we should bridge?
          if (!chunk.message.channels) {
            return;
          } else {
            await this.gotChannels;
            let shouldSend = false;
            for (const channel of chunk.message.channels) {
              if (this.channel_ids.length && !this.channel_ids.includes(channel.id)) {
                  continue;
              }
              shouldSend = true;
            }
            if (!shouldSend) {
              return;
            }
          }

          const textIntent = bridge
            .getIntent(`@mumble_${chunk.user.name}:${config.domain}`);
          textIntent.sendMessage(config.matrixRoom, {
            body: chunk.message.text,
            format: "org.matrix.custom.html",
            formatted_body: chunk.message.text,
            msgtype: "m.text"
          });
          break;
        default:
          break;
      }
      return;
    });

    // stream.on error
    return;
  }

  setMatrixClient(client: any) {
    this.matrixClient = client;
    return;
  }

  async sendMessage(event: MessageEvent, displayname?: string) {
    if (!this.client || !this.server || !this.gotChannels) {
      return;
    }

    let messageContent = event.content.body;
    if (event.content.msgtype === "m.image" || event.content.msgtype === "m.file") {
      const url = this.matrixClient.mxcUrlToHttp(event.content.url, null, null, null, true);
      if (url) {
        messageContent = `<a href="${url}">${event.content.body}</a>`;
      }
    }

    if (event.content.msgtype === "m.text"
      && event.content.format === "org.matrix.custom.html"
      && event.content.formatted_body) {
      messageContent = event.content.formatted_body;
    }

    // If displayname was not provided, fall back to username
    if (!displayname) {
      displayname = event.sender;
    }

    await this.gotChannels;
    this.client.textMessageSend({
      server: this.server,
      channels: this.channels,
      text: `${displayname}: ${messageContent}`,
    }, () => { });

    return;
  }
};
