import {
  AudioScenarioType,
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
} from 'react-native-agora';

let rtcEngine = null;
let registeredEventHandler = null;
let initializedAppId = null;

const ensureRtcEngine = (appId) => {
  if (!rtcEngine) {
    rtcEngine = createAgoraRtcEngine();
  }

  if (initializedAppId !== appId) {
    rtcEngine.initialize({
      appId,
      channelProfile: ChannelProfileType.ChannelProfileCommunication,
      audioScenario: AudioScenarioType.AudioScenarioDefault,
    });
    rtcEngine.enableAudio();
    rtcEngine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
    rtcEngine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
    initializedAppId = appId;
  }

  return rtcEngine;
};

const unregisterRtcEvents = () => {
  if (!rtcEngine || !registeredEventHandler) {
    return;
  }

  try {
    rtcEngine.unregisterEventHandler(registeredEventHandler);
  } catch (_error) {
    // Ignore event unregistration failures; channel leave still proceeds.
  } finally {
    registeredEventHandler = null;
  }
};

export const joinAgoraVoiceChannel = async ({
  appId,
  token,
  channelName,
  uid,
  onJoinSuccess,
  onUserJoined,
  onUserOffline,
  onConnectionStateChanged,
  onTokenWillExpire,
}) => {
  if (!appId || !channelName) {
    throw new Error('Agora appId and channelName are required to join voice channel.');
  }

  const engine = ensureRtcEngine(appId);
  unregisterRtcEvents();

  registeredEventHandler = {
    onJoinChannelSuccess: () => {
      onJoinSuccess?.();
    },
    onUserJoined: (_connection, remoteUid) => {
      onUserJoined?.(remoteUid);
    },
    onUserOffline: (_connection, remoteUid) => {
      onUserOffline?.(remoteUid);
    },
    onConnectionStateChanged: (_connection, state, reason) => {
      onConnectionStateChanged?.({ state, reason });
    },
    onTokenPrivilegeWillExpire: () => {
      onTokenWillExpire?.();
    },
  };

  engine.registerEventHandler(registeredEventHandler);

  const joinResult = engine.joinChannel(token || '', channelName, Number(uid) || 0, {
    publishMicrophoneTrack: true,
    autoSubscribeAudio: true,
    clientRoleType: ClientRoleType.ClientRoleBroadcaster,
  });

  if (joinResult < 0) {
    throw new Error(`Agora joinChannel failed with code ${joinResult}`);
  }

  return joinResult;
};

export const muteLocalAudio = (muted) => {
  if (!rtcEngine) {
    return;
  }
  rtcEngine.muteLocalAudioStream(Boolean(muted));
};

export const setSpeakerEnabled = (enabled) => {
  if (!rtcEngine) {
    return;
  }
  rtcEngine.setEnableSpeakerphone(Boolean(enabled));
};

export const renewAgoraVoiceToken = (token) => {
  if (!rtcEngine || !token) {
    return;
  }
  rtcEngine.renewToken(token);
};

export const leaveAgoraVoiceChannel = async () => {
  if (!rtcEngine) {
    return;
  }

  rtcEngine.leaveChannel();
  unregisterRtcEvents();
};

export const destroyAgoraVoiceEngine = () => {
  if (!rtcEngine) {
    return;
  }

  unregisterRtcEvents();
  try {
    rtcEngine.release();
  } catch (_error) {
    // Ignore release errors during teardown.
  }

  rtcEngine = null;
  initializedAppId = null;
};
