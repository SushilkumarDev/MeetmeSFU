'use strict';

const config = require('./config');
const Logger = require('./Logger');
const log = new Logger('Room');

module.exports = class Room {
    constructor(room_id, worker, io) {
        this.id = room_id;
        this.worker = worker;
        this.webRtcServer = worker.appData.webRtcServer;
        this.webRtcServerActive = config.mediasoup.webRtcServerActive;
        this.io = io;
        this.audioLevelObserver = null;
        this.audioLevelObserverEnabled = true;
        this.audioLastUpdateTime = 0;
        // ##########################
        this._isBroadcasting = false;
        // ##########################
        this._isLocked = false;
        this._isLobbyEnabled = false;
        this._roomPassword = null;
        this._hostOnlyRecording = false;
        // ##########################
        this._recSyncServerRecording = config?.server?.recording?.enabled || false;
        // ##########################
        this._moderator = {
            audio_start_muted: false,
            video_start_hidden: false,
            audio_cant_unmute: false,
            video_cant_unhide: false,
            screen_cant_share: false,
            chat_cant_privately: false,
            chat_cant_chatgpt: false,
        };
        this.survey = config.survey;
        this.redirect = config.redirect;
        this.peers = new Map();
        this.bannedPeers = [];
        this.webRtcTransport = config.mediasoup.webRtcTransport;
        this.router = null;
        this.routerSettings = config.mediasoup.router;
        this.createTheRouter();
    }

    // ####################################################
    // ROOM INFO
    // ####################################################

    toJson() {
        return {
            id: this.id,
            broadcasting: this._isBroadcasting,
            recSyncServerRecording: this._recSyncServerRecording,
            config: {
                isLocked: this._isLocked,
                isLobbyEnabled: this._isLobbyEnabled,
                hostOnlyRecording: this._hostOnlyRecording,
            },
            moderator: this._moderator,
            survey: this.survey,
            redirect: this.redirect,
            peers: JSON.stringify([...this.peers]),
        };
    }

    // ####################################################
    // ROUTER
    // ####################################################

    createTheRouter() {
        const { mediaCodecs } = this.routerSettings;
        this.worker
            .createRouter({
                mediaCodecs,
            })
            .then((router) => {
                this.router = router;
                if (this.audioLevelObserverEnabled) {
                    this.startAudioLevelObservation(router);
                }
            });
    }

    // ####################################################
    // PRODUCER AUDIO LEVEL OBSERVER
    // ####################################################

    async startAudioLevelObservation(router) {
        log.debug('Start audioLevelObserver for signaling active speaker...');

        this.audioLevelObserver = await router.createAudioLevelObserver({
            maxEntries: 1,
            threshold: -70,
            interval: 100,
        });

        this.audioLevelObserver.on('volumes', (volumes) => {
            this.sendActiveSpeakerVolume(volumes);
        });
        this.audioLevelObserver.on('silence', () => {
            //log.debug('audioLevelObserver', { volume: 'silence' });
        });
    }

    sendActiveSpeakerVolume(volumes) {
        try {
            if (!Array.isArray(volumes) || volumes.length === 0) {
                throw new Error('Invalid volumes array');
            }

            if (Date.now() > this.audioLastUpdateTime + 100) {
                this.audioLastUpdateTime = Date.now();

                const { producer, volume } = volumes[0];
                const audioVolume = Math.round(Math.pow(10, volume / 70) * 10); // Scale volume to 1-10

                if (audioVolume > 1) {
                    this.peers.forEach((peer) => {
                        const { id, peer_audio, peer_name } = peer;
                        peer.producers.forEach((peerProducer) => {
                            if (peerProducer.id === producer.id && peerProducer.kind === 'audio' && peer_audio) {
                                const data = {
                                    peer_id: id,
                                    peer_name: peer_name,
                                    audioVolume: audioVolume,
                                };
                                // Uncomment the following line for debugging
                                // log.debug('Sending audio volume', data);
                                this.sendToAll('audioVolume', data);
                            }
                        });
                    });
                }
            }
        } catch (error) {
            log.error('Error sending active speaker volume', error.message);
        }
    }

    addProducerToAudioLevelObserver(producer) {
        if (this.audioLevelObserverEnabled) {
            this.audioLevelObserver.addProducer(producer);
        }
    }

    getRtpCapabilities() {
        return this.router.rtpCapabilities;
    }

    // ####################################################
    // ROOM MODERATOR
    // ####################################################

    updateRoomModeratorALL(data) {
        this._moderator = data;
        log.debug('Update room moderator all data', this._moderator);
    }

    updateRoomModerator(data) {
        log.debug('Update room moderator', data);
        switch (data.type) {
            case 'audio_start_muted':
                this._moderator.audio_start_muted = data.status;
                break;
            case 'video_start_hidden':
                this._moderator.video_start_hidden = data.status;
            case 'audio_cant_unmute':
                this._moderator.audio_cant_unmute = data.status;
                break;
            case 'video_cant_unhide':
                this._moderator.video_cant_unhide = data.status;
            case 'screen_cant_share':
                this._moderator.screen_cant_share = data.status;
                break;
            case 'chat_cant_privately':
                this._moderator.chat_cant_privately = data.status;
                break;
            case 'chat_cant_chatgpt':
                this._moderator.chat_cant_chatgpt = data.status;
                break;
            default:
                break;
        }
    }

    // ####################################################
    // PEERS
    // ####################################################

    addPeer(peer) {
        this.peers.set(peer.id, peer);
    }

    getPeer(socket_id) {
        //
        if (!this.peers.has(socket_id)) {
            log.error('---> Peer not found for socket ID', socket_id);
            return null;
        }

        const peer = this.peers.get(socket_id);

        if (!peer || typeof peer !== 'object') {
            log.error('---> Peer object not found for socket ID', socket_id);
            return null;
        }

        return peer;
    }

    getPeers() {
        return this.peers;
    }

    getPeersCount() {
        return this.peers.size;
    }

    getProducerListForPeer() {
        const producerList = [];
        this.peers.forEach((peer) => {
            const { peer_name, peer_info } = peer;
            peer.producers.forEach((producer) => {
                producerList.push({
                    producer_id: producer.id,
                    peer_name: peer_name,
                    peer_info: peer_info,
                    type: producer.appData.mediaType,
                });
            });
        });
        return producerList;
    }

    async removePeer(socket_id) {
        const peer = this.getPeer(socket_id);

        if (!peer || typeof peer !== 'object') {
            return;
        }

        const { id, peer_name } = peer;

        const peerTransports = peer.getTransports();
        const peerProducers = peer.getProducers();
        const peerConsumers = peer.getConsumers();

        log.debug('REMOVE PEER', {
            peer_id: id,
            peer_name: peer_name,
            peerTransports: peerTransports,
            peerProducers: peerProducers,
            peerConsumers: peerConsumers,
        });

        peer.close();

        this.peers.delete(socket_id);
    }

    // ####################################################
    // WebRTC TRANSPORT
    // ####################################################
    async createWebRtcTransport(socket_id) {
        const { maxIncomingBitrate, initialAvailableOutgoingBitrate, listenInfos } = this.webRtcTransport;

        const webRtcTransportOptions = {
            ...(this.webRtcServerActive ? { webRtcServer: this.webRtcServer } : { listenInfos: listenInfos }),
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            iceConsentTimeout: 20,
            initialAvailableOutgoingBitrate,
        };

        const transport = await this.router.createWebRtcTransport(webRtcTransportOptions);

        if (!transport) {
            return this.callback('[Room|createWebRtcTransport] Failed to create WebRTC transport');
        }

        const { id, iceParameters, iceCandidates, dtlsParameters } = transport;

        if (maxIncomingBitrate) {
            try {
                await transport.setMaxIncomingBitrate(maxIncomingBitrate);
            } catch (error) {
                log.debug('Transport setMaxIncomingBitrate error', error.message);
            }
        }

        const peer = this.getPeer(socket_id);

        if (!peer || typeof peer !== 'object') {
            return this.callback(`[Room|createWebRtcTransport] Peer object not found for socket ID: ${socket_id}`);
        }

        const { peer_name } = peer;

        transport.on('icestatechange', (iceState) => {
            if (iceState === 'disconnected' || iceState === 'closed') {
                log.debug('Transport closed "icestatechange" event', {
                    peer_name: peer_name,
                    iceState: iceState,
                });
                transport.close();
            }
        });

        transport.on('sctpstatechange', (sctpState) => {
            log.debug('Transport "sctpstatechange" event', {
                peer_name: peer_name,
                sctpState: sctpState,
            });
        });

        transport.on('dtlsstatechange', (dtlsState) => {
            if (dtlsState === 'failed' || dtlsState === 'closed') {
                log.debug('Transport closed "dtlsstatechange" event', {
                    peer_name: peer_name,
                    dtlsState: dtlsState,
                });
                transport.close();
            }
        });

        transport.observer.on('close', () => {
            log.debug('Transport closed', { peer_name: peer_name, transport_id: transport.id });
        });

        log.debug('Adding transport', { transportId: id });

        peer.addTransport(transport);

        return {
            id: id,
            iceParameters: iceParameters,
            iceCandidates: iceCandidates,
            dtlsParameters: dtlsParameters,
        };
    }

    async connectPeerTransport(socket_id, transport_id, dtlsParameters) {
        try {
            if (!socket_id || !transport_id || !dtlsParameters) {
                return this.callback('[Room|connectPeerTransport] Invalid input parameters');
            }

            const peer = this.getPeer(socket_id);

            if (!peer || typeof peer !== 'object') {
                return this.callback(`[Room|connectPeerTransport] Peer object not found for socket ID: ${socket_id}`);
            }

            const connectTransport = await peer.connectTransport(transport_id, dtlsParameters);

            if (!connectTransport) {
                return this.callback(`[Room|connectPeerTransport] error: Transport with ID ${transport_id} not found`);
            }

            return '[Room|connectPeerTransport] done';
        } catch (error) {
            log.error('Error connecting peer transport', error.message);
            return this.callback(`[Room|connectPeerTransport] error: ${error.message}`);
        }
    }