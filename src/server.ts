
import * as httpolyglot from '@httptoolkit/httpolyglot';
import { makeDestroyable } from 'destroyable-server';
import { AdminServer } from './admin-server.js';

async function startAdminServer(options: {
    adminPort: number;
}) {
    const adminServer = new AdminServer(options.adminPort);
    await adminServer.start();
    return adminServer;
}

async function startPublicUrlServer(options: {
    publicPort: number;
}) {
    const server = makeDestroyable(httpolyglot.createServer({
        socks: undefined,
        unknownProtocol: undefined,
        tls: undefined
    }, (req, res) => {
        console.log(`Received public url request: ${req.method} ${req.url}`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello from Public URL Server!\n');
    }));

    server.on('connection', (socket) => {
        console.log('Got socket for public url server');
    });

    await new Promise<void>((resolve) => {
        server.listen(options.publicPort, () => {
            resolve();
        });
    });

    return server;
}

export async function startServers(options: {
    adminPort: number;
    publicPort: number;
}) {
    const servers: Array<{ destroy: () => Promise<void> }> = await Promise.all([
        startAdminServer({ adminPort: options.adminPort }),
        startPublicUrlServer({ publicPort: options.publicPort })
    ]);

    return servers;
}

// This is not a perfect test (various odd cases) but good enough
const wasRunDirectly = import.meta.filename === process?.argv[1];
if (wasRunDirectly) {
    startServers({
        adminPort: parseInt(process.env.ADMIN_PORT ?? '4000', 10),
        publicPort: parseInt(process.env.PUBLIC_PORT ?? '4040', 10)
    }).then(() => {
        console.log('Server started');
    });
}