import * as readline from 'readline';
import * as crypto from 'crypto';
import * as http2 from 'http2';

import { DestroyableServer, makeDestroyable } from 'destroyable-server';

export class AdminServer {

    private readonly port: number;
    private readonly server!: DestroyableServer;

    private readonly connectionMap = new Map<string, {
        controlStream: http2.ServerHttp2Stream;
        session: http2.ServerHttp2Session;
    }>();

    constructor(port: number) {
        this.port = port;

        this.server = makeDestroyable(http2.createServer());
        this.server.on('session', this.handleSession.bind(this));
    }

    public async start() {
        await new Promise<void>((resolve) => {
            this.server.listen({ port: this.port }, resolve);
        });
    }

    public async destroy() {
        return this.server.destroy();
    }

    private handleSession(session: http2.ServerHttp2Session) {
        session.on('stream', (stream: http2.ServerHttp2Stream, headers: http2.IncomingHttpHeaders) => {
            console.log('Received admin request:', headers[':method'], headers[':path']);
            if (headers[':path'] === '/start' && headers[':method'] === 'POST') {
                this.handleStartRequest(stream, session).catch((err) => {
                    console.error(`Control channel setup failed:`, err);
                });
                return;
            } if (headers[':path'] === '/end' && headers[':method'] === 'POST') {
                stream.respond({ ':status': 200 })
                stream.end();
                session.close();
            } else {
                stream.respond({ ':status': 404 });
                stream.end();
            }
        });
    }

    private async handleStartRequest(stream: http2.ServerHttp2Stream, session: http2.ServerHttp2Session) {
        stream.respond({ ':status': 200 });

        const lineStream = readline.createInterface({ input: stream, crlfDelay: Infinity });
        const firstLine = await getNextLine(lineStream);
        const firstCommand = JSON.parse(firstLine);

        if (firstCommand.command !== 'auth') {
            stream.end(JSON.stringify({ error: 'Auth required' }));
        }

        const endpointId = crypto.randomBytes(12).toString('hex');
        this.connectionMap.set(endpointId, {
            controlStream: stream,
            session: session
        });

        stream.write(JSON.stringify({
            success: true,
            endpointId
        }) + '\n');

        stream.on('close', () => {
            this.connectionMap.delete(endpointId);
            stream.end();
            session.close();
        });
    }

}

function getNextLine(rl: readline.Interface): Promise<string> {
    return new Promise((resolve, reject) => {
        rl.once('line', (line) => {
            if (!line) return; // Ignore empty lines, can be used as keep-alives
            resolve(line);
        });
        rl.once('end', () => reject(new Error('Stream ended unexpected')));
        rl.once('error', reject);
    });
}