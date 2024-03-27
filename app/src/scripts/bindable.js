'use strict';

const config = require('../config');

const net = require('net');

/*
    Run: node bindable.js

    In networking, "bindable" refers to the ability to assign or allocate a specific IP address and port combination 
    to a network service or application. Binding an IP address and port allows the service or application to listen for 
    incoming network connections on that particular address and port.

    When we say an IP address and port are "bindable," it means that there are no conflicts or issues preventing the service 
    or application from using that specific combination. In other words, the IP address is available, and the port is not already 
    in use by another process or service on the same machine.

    If an IP address and port are bindable, it indicates that the network service or application can successfully bind to that 
    combination, allowing it to accept incoming connections and communicate over the network. On the other hand, if the IP address 
    and port are not bindable, it suggests that there may be conflicts or restrictions preventing the service or application 
    from using them, such as another process already listening on the same IP address and port.
*/

async function main() {
    // Server listen
    const serverListenIp = config.server.listen.ip;
    const serverListenPort = config.server.listen.port;

    // WebRtcServerActive
    const webRtcServerActive = config.mediasoup.webRtcServerActive;

    // WebRtcTransportOptions
    const webRtcTransportIpInfo = config.mediasoup.webRtcTransport.listenInfos[0];
    const webRtcTransportIpAddress =
        webRtcTransportIpInfo.ip !== '0.0.0.0' ? webRtcTransportIpInfo.ip : webRtcTransportIpInfo.announcedAddress;

    // WorkersOptions
    const workers = config.mediasoup.numWorkers;
    const rtcMinPort = config.mediasoup.worker.rtcMinPort;
    const rtcMaxPort = config.mediasoup.worker.rtcMaxPort;

    console.log('==================================');
    console.log('checkServerListenPorts');
    console.log('==================================');

    await checkServerListenPorts(serverListenIp, serverListenPort);

    console.log('==================================');
    console.log('checkWebRtcTransportPorts');
    console.log('==================================');

    await checkWebRtcTransportPorts(webRtcTransportIpAddress, rtcMinPort, rtcMaxPort);

    if (webRtcServerActive) {
        console.log('==================================');
        console.log('checkWebRtcServerPorts');
        console.log('==================================');

        // WebRtcServerOptions
        const webRtcServerIpInfo = config.mediasoup.webRtcServerOptions.listenInfos[0];
        const webRtcServerIpAddress =
            webRtcServerIpInfo.ip !== '0.0.0.0' ? webRtcServerIpInfo.ip : webRtcServerIpInfo.announcedAddress;
        const webRtcServerStartPort = webRtcServerIpInfo.port;

        await checkWebRtcServerPorts(webRtcServerIpAddress, webRtcServerStartPort, workers);
    }
}