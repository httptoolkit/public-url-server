import { once } from 'events';
import { createInterface } from 'readline';
import * as http2 from 'http2';
import { expect } from 'chai';

import { startServers } from '../src/server.ts';

function sendH2Request(port: number, path: string): Promise<{ headers: http2.IncomingHttpHeaders; stream: http2.ClientHttp2Stream }> {
    return new Promise((resolve, reject) => {
        const client = http2.connect(`http://localhost:${port}`);
        const req = client.request({ ':path': path });

        req.on('response', (headers) => {
            resolve({ headers, stream: req });
        });
        req.on('error', reject);
        req.end();
    });
}

const ADMIN_PORT = 5050;
const PUBLIC_PORT = 5001;

describe("Smoke test", () => {

    let servers: Array<{ destroy: () => Promise<void> }>;

    beforeEach(async () => {
        servers = await startServers({
            adminPort: ADMIN_PORT,
            publicPort: PUBLIC_PORT
        });
    });

    afterEach(async () => {
        await Promise.all(servers.map(s => s.destroy()));
    });

    it("sets up a public endpoint", async () => {
        const response = await fetch(`http://localhost:${PUBLIC_PORT}/`);
        const text = await response.text();

        expect(response.status).to.equal(200);
        expect(text).to.equal('Hello from Public URL Server!\n');
    });

    it("can create & tunnel an HTTP request", async () => {
        const h2Client = http2.connect(`http://localhost:${ADMIN_PORT}/`);
        const adminReq = h2Client.request({
            ':method': 'POST',
            ':path': '/start'
        });

        const [headers] = await once(adminReq, 'response') as [http2.IncomingHttpHeaders];
        expect(headers[':status']).to.equal(200);

        const lineStream = createInterface({ input: adminReq, crlfDelay: Infinity });

        adminReq.write(JSON.stringify({
            command: 'auth',
            params: {}
        }) + '\n');

        const [adminResponseLine] = await once(lineStream, 'line') as [string];
        const adminResponse = JSON.parse(adminResponseLine);
        expect(adminResponse.success).to.equal(true);
        expect(adminResponse.endpointId).to.be.a('string');


    });

});