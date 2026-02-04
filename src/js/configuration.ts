import GameShell from './jagex2/client/GameShell';
import {Client} from './client';
import {downloadText, sleep} from './jagex2/util/JsUtil';

type WorldList = {
    id: number;
    region: string;
    address: string;
    portOffset: number;
    players: number;
    members?: boolean;
};

export async function setupConfiguration(): Promise<void> {
    await world();
    detail();
    method();
}

// setup the world config.
async function world(): Promise<void> {
    if (GameShell.getParameter('world').length === 0) {
        GameShell.setParameter('world', '1');
    }

    // RS Haven: Use current host as proxy (website handles routing)
    const hostname: string = window.location.hostname;
    if (hostname.includes('rsps') || hostname.includes('rshaven') || hostname.includes('nothingnewgames')) {
        rsHavenConfiguration();
    } else if (['0', '998', '999'].includes(GameShell.getParameter('world'))) {
        localConfiguration();
    } else {
        await liveConfiguration(window.location.protocol.startsWith('https'));
    }
}

// setup the detail
function detail(): void {
    if (GameShell.getParameter('detail').length === 0) {
        GameShell.setParameter('detail', 'high');
    }
    if (GameShell.getParameter('detail') === 'low') {
        Client.setLowMemory();
    } else {
        Client.setHighMemory();
    }
}

// setup the method
function method(): void {
    if (GameShell.getParameter('method').length === 0) {
        GameShell.setParameter('method', '0');
    }
}

// ---

function rsHavenConfiguration(): void {
    // RS Haven uses the website as a reverse proxy
    // All connections go through current host, website routes to correct world
    const protocol: string = window.location.protocol;
    const host: string = window.location.host;

    Client.serverAddress = `${protocol}//${host}`;
    Client.httpAddress = `${protocol}//${host}`;
    Client.portOffset = 0;
    Client.members = true;
    Client.useDefaultWebSocketPort = true; // RS Haven proxies WebSocket through default HTTPS port
}

function localConfiguration(): void {
    if (+GameShell.getParameter('world') >= 998) {
        Client.httpAddress = 'data/pack/client';
        return;
    }

    Client.serverAddress = 'http://localhost';
    Client.httpAddress = 'http://localhost';
    Client.portOffset = 0;
}

async function liveConfiguration(secured: boolean): Promise<void> {
    const world: WorldList = await getWorldInfo(secured, parseInt(GameShell.getParameter('world'), 10));
    const url: URL = new URL(world.address);

    Client.nodeId = 10 + world.id - 1;
    // this way so we dont keep the port if address has one
    Client.serverAddress = `${url.protocol}//${url.hostname}`;
    Client.httpAddress = `${url.protocol}//${url.hostname}:${url.port}`;
    if (!secured) {
        Client.serverAddress = Client.serverAddress.replace('https:', 'http:');
    }
    Client.portOffset = world.portOffset;
    Client.members = world?.members === true;
    GameShell.setParameter('world', world.id.toString(10));
}

async function getWorldInfo(secured: boolean, id: number, retries: number = 0): Promise<WorldList> {
    if (retries >= 10) {
        throw new Error('could not find world to connect!');
    }
    const protocol: string = secured ? 'https:' : 'http:';
    let worldlist: WorldList[];
    try {
        worldlist = JSON.parse(await downloadText(`${protocol}//2004scape.org/api/v1/worldlist`));
    } catch (e) {
        await sleep(1000);
        return getWorldInfo(secured, id, ++retries);
    }
    worldlist.push({
        id: 0,
        region: 'Local Development',
        address: 'http://localhost',
        portOffset: 0,
        members: true,
        players: 0
    });
    const world: WorldList | undefined = worldlist.find((x): boolean => x.id === id);
    if (!world) {
        return getWorldInfo(secured, id, 10);
    }
    return world;
}
