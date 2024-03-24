'use strict';

const Logger = require('./Logger');
const log = new Logger('Peer');

module.exports = class Peer {
    constructor(socket_id, data) {
        const { peer_info } = data;

        this.id = socket_id;
        this.peer_info = peer_info;
        this.peer_name = peer_info.peer_name;
        this.peer_presenter = peer_info.peer_presenter;
        this.peer_audio = peer_info.peer_audio;
        this.peer_video = peer_info.peer_video;
        this.peer_video_privacy = peer_info.peer_video_privacy;
        this.peer_recording = peer_info.peer_recording;
        this.peer_hand = peer_info.peer_hand;

        this.transports = new Map();
        this.consumers = new Map();
        this.producers = new Map();
    }