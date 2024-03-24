'use strict';

const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');

const config = require('./config');
const { v4: uuidV4 } = require('uuid');

const JWT_KEY = (config.jwt && config.jwt.key) || 'mirotalksfu_jwt_secret';
const JWT_EXP = (config.jwt && config.jwt.exp) || '1h';

module.exports = class ServerApi {
    constructor(host = null, authorization = null) {
        this._host = host;
        this._authorization = authorization;
        this._api_key_secret = config.api.keySecret;
    }

    isAuthorized() {
        if (this._authorization != this._api_key_secret) return false;
        return true;
    }

    getMeetings(roomList) {
        const meetings = Array.from(roomList.entries()).map(([id, room]) => {
            const peers = Array.from(room.peers.values()).map(
                ({
                    peer_info: {
                        peer_name,
                        peer_presenter,
                        peer_video,
                        peer_audio,
                        peer_screen,
                        peer_hand,
                        os_name,
                        os_version,
                        browser_name,
                        browser_version,
                    },
                }) => ({
                    name: peer_name,
                    presenter: peer_presenter,
                    video: peer_video,
                    audio: peer_audio,
                    screen: peer_screen,
                    hand: peer_hand,
                    os: os_name ? `${os_name} ${os_version}` : '',
                    browser: browser_name ? `${browser_name} ${browser_version}` : '',
                }),
            );
            return {
                roomId: id,
                peers: peers,
            };
        });
        return meetings;
    }