// Muaz Khan      - www.MuazKhan.com
// MIT License    - www.WebRTC-Experiment.com/licence
// Documentation  - github.com/muaz-khan/WebRTC-Experiment/tree/master/WebRTC-File-Sharing

// _______
// PeerConnection.js
(function () {

    window.PeerConnection = function (socketURL, userid) {
        this.userid = userid || getToken();
        this.peers = {};

        if (!socketURL) throw 'Socket-URL is mandatory.';

        var signaler = new Signaler(this, socketURL);

        var that = this;
        this.send = function (data) {
            var channel = answererDataChannel || offererDataChannel;

            if (channel.readyState != 'open')
                return setTimeout(function () {
                    that.send(data);
                }, 1000);
            channel.send(data);
        };

        signaler.ondata = function (data) {
            if (that.ondata) that.ondata(data);
        };

        this.onopen = function () {
            console.log('DataChannel Opened.');
        };
    };

    function Signaler(root, socketURL) {
        var self = this;

        root.startBroadcasting = function () {
            (function transmit() {
                socket.send({
                    userid: root.userid,
                    broadcasting: true
                });

                !self.participantFound && !self.stopBroadcasting &&
                    setTimeout(transmit, 3000);
            })();
        };

        root.sendParticipationRequest = function (userid) {
            socket.send({
                participationRequest: true,
                userid: root.userid,
                to: userid
            });
        };

        // if someone shared SDP
        this.onsdp = function (message) {
            var sdp = message.sdp;

            if (sdp.type == 'offer') {
                root.peers[message.userid] = Answer.createAnswer(merge(options, {
                    sdp: sdp
                }));
            }

            if (sdp.type == 'answer') {
                root.peers[message.userid].setRemoteDescription(sdp);
            }
        };

        root.acceptRequest = function (userid) {
            root.peers[userid] = Offer.createOffer(options);
        };

        // it is passed over Offer/Answer objects for reusability
        var options = {
            onsdp: function (sdp) {
                socket.send({
                    userid: root.userid,
                    sdp: sdp,
                    to: root.participant
                });
            },
            onicecandidate: function (candidate) {
                socket.send({
                    userid: root.userid,
                    candidate: candidate,
                    to: root.participant
                });
            },
            askToCreateDataChannel: function () {
                socket.send({
                    userid: root.userid,
                    to: root.participant,
                    isCreateDataChannel: true
                });
            },
            ondata: function (data) {
                self.ondata(data);
            },
            onopen: function () {
                root.onopen();
            },
            onclose: function (e) {
                if (root.onclose) root.onclose(e);
            },
            onerror: function (e) {
                if (root.onerror) root.onerror(e);
            }
        };

        function closePeerConnections() {
            self.stopBroadcasting = true;

            for (var userid in root.peers) {
                root.peers[userid].peer.close();
            }
            root.peers = {};
        }

        root.close = function () {
            socket.send({
                userLeft: true,
                userid: root.userid,
                to: root.participant
            });
            closePeerConnections();
        };

        window.onbeforeunload = function () {
            root.close();
        };

        window.onkeyup = function (e) {
            if (e.keyCode == 116)
                root.close();
        };

        // users who broadcasts themselves
        var invokers = {}, peer;
        
        function onmessage(e) {
            var message = JSON.parse(e.data);

            if (message.userid == root.userid) return;
            root.participant = message.userid;

            // for pretty logging
            message.sdp && console.debug(JSON.stringify(message, function (key, value) {
                console.log(value.sdp.type, '---', value.sdp.sdp);
            }, '---'));

            // if someone shared SDP
            if (message.sdp && message.to == root.userid) {
                self.onsdp(message);
            }

            // if someone shared ICE
            if (message.candidate && message.to == root.userid) {
                peer = root.peers[message.userid];
                if (peer) peer.addIceCandidate(message.candidate);
            }

            // if offerer asked to create data channel
            if (message.isCreateDataChannel && message.to == root.userid) {
                peer = root.peers[message.userid];
                if (peer) peer.createDataChannel();
            }

            // if someone sent participation request
            if (message.participationRequest && message.to == root.userid) {
                self.participantFound = true;

                if (root.onParticipationRequest) {
                    root.onParticipationRequest(message.userid);
                } else root.acceptRequest(message.userid);
            }

            // if someone is broadcasting himself!
            if (message.broadcasting) {
                if (!invokers[message.userid]) {
                    invokers[message.userid] = message;
                    if (root.onuserfound)
                        root.onuserfound(message.userid);
                    else
                        root.sendParticipationRequest(message.userid);
                }
            }

            if (message.userLeft && message.to == root.userid) {
                closePeerConnections();
            }
        }

        var socket = socketURL;
        if (typeof socketURL == 'string') {
            socket = new WebSocket(socketURL);
            socket.push = socket.send;
            socket.send = function (data) {
                if (socket.readyState != 1)
                    return setTimeout(function () {
                        socket.send(data);
                    }, 1000);

                socket.push(JSON.stringify(data));
            };

            socket.onopen = function () {
                console.log('websocket connection opened.');
            };
        }
        socket.onmessage = onmessage;
    }

    // IceServersHandler.js

    var IceServersHandler = (function() {
        function getIceServers(connection) {
            var iceServers = [];

            iceServers.push(getSTUNObj('stun:stun.l.google.com:19302'));

            iceServers.push(getTURNObj('stun:webrtcweb.com:7788', 'muazkh', 'muazkh')); // coTURN
            iceServers.push(getTURNObj('turn:webrtcweb.com:7788', 'muazkh', 'muazkh')); // coTURN
            iceServers.push(getTURNObj('turn:webrtcweb.com:8877', 'muazkh', 'muazkh')); // coTURN

            iceServers.push(getTURNObj('turns:webrtcweb.com:7788', 'muazkh', 'muazkh')); // coTURN
            iceServers.push(getTURNObj('turns:webrtcweb.com:8877', 'muazkh', 'muazkh')); // coTURN

            // iceServers.push(getTURNObj('turn:webrtcweb.com:3344', 'muazkh', 'muazkh')); // resiprocate
            // iceServers.push(getTURNObj('turn:webrtcweb.com:4433', 'muazkh', 'muazkh')); // resiprocate

            // check if restund is still active: http://webrtcweb.com:4050/
            iceServers.push(getTURNObj('stun:webrtcweb.com:4455', 'muazkh', 'muazkh')); // restund
            iceServers.push(getTURNObj('turn:webrtcweb.com:4455', 'muazkh', 'muazkh')); // restund
            iceServers.push(getTURNObj('turn:webrtcweb.com:5544?transport=tcp', 'muazkh', 'muazkh')); // restund

            return iceServers;
        }

        function getSTUNObj(stunStr) {
            var urlsParam = 'urls';
            if (typeof isPluginRTC !== 'undefined') {
                urlsParam = 'url';
            }

            var obj = {};
            obj[urlsParam] = stunStr;
            return obj;
        }

        function getTURNObj(turnStr, username, credential) {
            var urlsParam = 'urls';
            if (typeof isPluginRTC !== 'undefined') {
                urlsParam = 'url';
            }

            var obj = {
                username: username,
                credential: credential
            };
            obj[urlsParam] = turnStr;
            return obj;
        }

        return {
            getIceServers: getIceServers
        };
    })();

    // reusable stuff
    var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
    var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
    var RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;

    navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
    window.URL = window.URL || window.webkitURL;

    var iceServers = {
        iceServers: IceServersHandler.getIceServers()
    };

    var optionalArgument = {
        optional: [{
            DtlsSrtpKeyAgreement: true
        }]
    };

    var offerAnswerConstraints = {
        optional: [],
        mandatory: {
            OfferToReceiveAudio: false,
            OfferToReceiveVideo: false
        }
    };

    function getToken() {
        return Math.round(Math.random() * 9999999999) + 9999999999;
    }

    function setChannelEvents(channel, config) {
        channel.onmessage = function (event) {
            var data = JSON.parse(event.data);
            config.ondata(data);
        };
        channel.onopen = function () {
            config.onopen();

            channel.push = channel.send;
            channel.send = function (data) {
                channel.push(JSON.stringify(data));
            };
        };

        channel.onerror = function (e) {
            console.error('channel.onerror', JSON.stringify(e, null, '\t'));
            config.onerror(e);
        };

        channel.onclose = function (e) {
            console.warn('channel.onclose', JSON.stringify(e, null, '\t'));
            config.onclose(e);
        };
    }

    var dataChannelDict = {};
    var offererDataChannel;

    var Offer = {
        createOffer: function (config) {
            var peer = new RTCPeerConnection(iceServers, optionalArgument);

            var self = this;
            self.config = config;

            peer.ongatheringchange = function (event) {
                if (event.currentTarget && event.currentTarget.iceGatheringState === 'complete') returnSDP();
            };

            function returnSDP() {
                console.debug('sharing localDescription', peer.localDescription);
                config.onsdp(peer.localDescription);
            }

            peer.ondatachannel = function (event) {
                offererDataChannel = event.channel;
                setChannelEvents(offererDataChannel, config);
            };

            peer.onicecandidate = function (event) {
                if (!event.candidate) returnSDP();
                else console.debug('injecting ice in sdp:', event.candidate.candidate);
            };

            peer.onsignalingstatechange = function () {
                console.log('onsignalingstatechange:', JSON.stringify({
                    iceGatheringState: peer.iceGatheringState,
                    signalingState: peer.signalingState
                }));
            };
            peer.oniceconnectionstatechange = function () {
                console.log('oniceconnectionstatechange:', JSON.stringify({
                    iceGatheringState: peer.iceGatheringState,
                    signalingState: peer.signalingState
                }));
            };

            createOffer();

            function createOffer() {
                self.createDataChannel(peer);

                window.peer = peer;
                peer.createOffer(function (sdp) {
                    peer.setLocalDescription(sdp);

                    config.onsdp(sdp);
                }, onSdpError, offerAnswerConstraints);

                self.peer = peer;
            }

            return self;
        },
        setRemoteDescription: function (sdp) {
            this.peer.setRemoteDescription(new RTCSessionDescription(sdp));
        },
        addIceCandidate: function (candidate) {
            this.peer.addIceCandidate(new RTCIceCandidate({
                sdpMLineIndex: candidate.sdpMLineIndex,
                candidate: candidate.candidate
            }));
        },
        createDataChannel: function (peer) {
            offererDataChannel = (this.peer || peer).createDataChannel('channel', dataChannelDict);
            setChannelEvents(offererDataChannel, this.config);
        }
    };

    var answererDataChannel;

    var Answer = {
        createAnswer: function (config) {
            var peer = new RTCPeerConnection(iceServers, optionalArgument);

            var self = this;
            self.config = config;

            peer.ondatachannel = function (event) {
                answererDataChannel = event.channel;
                setChannelEvents(answererDataChannel, config);
            };

            peer.onicecandidate = function (event) {
                if (event.candidate)
                    config.onicecandidate(event.candidate);
            };

            peer.onsignalingstatechange = function () {
                console.log('onsignalingstatechange:', JSON.stringify({
                    iceGatheringState: peer.iceGatheringState,
                    signalingState: peer.signalingState
                }));
            };
            peer.oniceconnectionstatechange = function () {
                console.log('oniceconnectionstatechange:', JSON.stringify({
                    iceGatheringState: peer.iceGatheringState,
                    signalingState: peer.signalingState
                }));
            };

            createAnswer();

            function createAnswer() {
                peer.setRemoteDescription(new RTCSessionDescription(config.sdp));
                peer.createAnswer(function (sdp) {
                    peer.setLocalDescription(sdp);

                    config.onsdp(sdp);
                }, onSdpError, offerAnswerConstraints);

                self.peer = peer;
            }

            return self;
        },
        addIceCandidate: function (candidate) {
            this.peer.addIceCandidate(new RTCIceCandidate({
                sdpMLineIndex: candidate.sdpMLineIndex,
                candidate: candidate.candidate
            }));
        },
        createDataChannel: function (peer) {
            answererDataChannel = (this.peer || peer).createDataChannel('channel', dataChannelDict);
            setChannelEvents(answererDataChannel, this.config);
        }
    };

    function merge(mergein, mergeto) {
        for (var t in mergeto) {
            mergein[t] = mergeto[t];
        }
        return mergein;
    }

    function useless() {
    }

    function onSdpError(e) {
        console.error(e);
    }
})();
