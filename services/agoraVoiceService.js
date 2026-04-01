import {
  AudioProfileType,
  AudioScenarioType,
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
} from 'react-native-agora';
import { Platform } from 'react-native';
import { AUTH_DEBUG_ENABLED } from '../constants/api';
import {
  startCommunicationAudioRoute,
  stopCommunicationAudioRoute,
  updateCommunicationAudioRoute,
} from './callAudioRouteService';
import {
  startOngoingCallForegroundService,
  stopOngoingCallForegroundService,
} from './ongoingCallService';

let rtcEngine = null;
let registeredEventHandler = null;
let initializedAppId = null;
let activeChannelName = null;
let joinedChannelName = null;
let pendingJoin = null;
let pendingJoinControls = null;
let pendingJoinTimeout = null;
let recoveringRejectedJoin = false;
let pendingLeave = null;
let pendingLeaveTimeout = null;
let leaveEventHandler = null;
let currentMicMuted = false;
let currentSpeakerOn = false;
let foregroundServiceSessionId = null;

const logAgoraVoice = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[AgoraVoice] ${label}`, payload);
};

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

    try {
      rtcEngine.enableAudio();
      rtcEngine.enableLocalAudio(true);
      rtcEngine.muteAllRemoteAudioStreams(false);
      rtcEngine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
      rtcEngine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
      rtcEngine.setAudioProfile(
        AudioProfileType.AudioProfileSpeechStandard,
        AudioScenarioType.AudioScenarioDefault,
      );
      rtcEngine.setDefaultAudioRouteToSpeakerphone(false);
    } catch (_error) {
      // Some SDK builds may not support all audio helpers; continue with defaults.
    }
    initializedAppId = appId;
  }

  return rtcEngine;
};

const clearPendingJoin = () => {
  if (pendingJoinTimeout) {
    clearTimeout(pendingJoinTimeout);
  }

  pendingJoinTimeout = null;
  pendingJoin = null;
  pendingJoinControls = null;
};

const cancelPendingJoin = (reason) => {
  if (!pendingJoinControls?.reject) {
    clearPendingJoin();
    return;
  }

  try {
    pendingJoinControls.reject(new Error(reason || 'Agora join cancelled'));
  } catch (_error) {
    // ignore rejection errors
  } finally {
    clearPendingJoin();
  }

  // Ensure the engine isn't left in a half-joined state.
  unregisterRtcEvents();
  activeChannelName = null;
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

const unregisterLeaveEvents = () => {
  if (!rtcEngine || !leaveEventHandler) {
    return;
  }

  try {
    rtcEngine.unregisterEventHandler(leaveEventHandler);
  } catch (_error) {
    // Ignore event unregistration failures; channel leave still proceeds.
  } finally {
    leaveEventHandler = null;
  }
};

const ensureVoiceStreamsActive = ({ micMuted = false, reason = 'unknown', speakerOn = currentSpeakerOn } = {}) => {
  if (!rtcEngine) {
    return;
  }

  currentMicMuted = Boolean(micMuted);
  currentSpeakerOn = Boolean(speakerOn);

  try {
    rtcEngine.enableAudio();
    rtcEngine.enableLocalAudio(true);
    rtcEngine.muteLocalAudioStream(currentMicMuted);
    rtcEngine.muteAllRemoteAudioStreams(false);
    rtcEngine.adjustRecordingSignalVolume(100);
    rtcEngine.adjustPlaybackSignalVolume(100);
    logAgoraVoice('voiceStreamsEnsured', {
      reason,
      localAudioEnabled: true,
      remoteAudioEnabled: true,
      micMuted: currentMicMuted,
      speakerOn: currentSpeakerOn,
    });
  } catch (error) {
    logAgoraVoice('voiceStreamsEnsureFailed', {
      reason,
      message: error?.message || 'Unknown error',
      micMuted: currentMicMuted,
      speakerOn: currentSpeakerOn,
    });
  }
};

const ensureOngoingCallService = async ({
  sessionId = null,
  subtitle = 'Voice call is active',
} = {}) => {
  foregroundServiceSessionId = sessionId || foregroundServiceSessionId || null;
  await startOngoingCallForegroundService({
    title: 'Clarivoice call in progress',
    subtitle,
    sessionId: foregroundServiceSessionId,
  });
};

const stopOngoingCallServiceIfNeeded = async ({ reason = 'unknown' } = {}) => {
  const activeSessionId = foregroundServiceSessionId;
  foregroundServiceSessionId = null;
  await stopOngoingCallForegroundService({
    reason,
    sessionId: activeSessionId,
  });
};

export const getAgoraVoiceSessionState = () => ({
  hasEngine: Boolean(rtcEngine),
  hasActiveChannel: Boolean(activeChannelName),
  hasJoinedChannel: Boolean(joinedChannelName),
  isJoining: Boolean(pendingJoin),
  isLeaving: Boolean(pendingLeave),
  currentMicMuted,
  currentSpeakerOn,
  foregroundServiceSessionId,
});

export const shouldKeepAgoraVoiceSessionAlive = () =>
  Boolean(rtcEngine && (activeChannelName || joinedChannelName || pendingJoin || pendingLeave));

export const joinAgoraVoiceChannel = async ({
  appId,
  token,
  channelName,
  uid,
  sessionId,
  onJoinSuccess,
  onUserJoined,
  onUserOffline,
  onConnectionStateChanged,
  onTokenWillExpire,
  onLocalAudioStateChanged,
  onRemoteAudioStateChanged,
  onAudioRoutingChanged,
  onAudioVolumeIndication,
}) => {
  if (!appId || !channelName) {
    throw new Error('Agora appId and channelName are required to join voice channel.');
  }

  const engine = ensureRtcEngine(appId);
  currentMicMuted = false;

  if (pendingLeave) {
    logAgoraVoice('joinAwaitingLeave', {
      channelName,
    });
    await pendingLeave.catch(() => {});
  }

  if (joinedChannelName === channelName) {
    logAgoraVoice('joinSkippedAlreadyJoined', {
      channelName,
    });
    return 0;
  }

  if (pendingJoin && activeChannelName === channelName) {
    logAgoraVoice('joinAwaitingExistingRequest', {
      channelName,
    });
    return pendingJoin;
  }

  if ((pendingJoin || joinedChannelName) && activeChannelName && activeChannelName !== channelName) {
    logAgoraVoice('leaveBeforeJoiningNewChannel', {
      previousChannelName: activeChannelName,
      nextChannelName: channelName,
    });
    await leaveAgoraVoiceChannel();
  }

  unregisterRtcEvents();

  try {
    await startCommunicationAudioRoute(false);
  } catch (_error) {
    // Native route preparation is best-effort; Agora join still proceeds.
  }

  await ensureOngoingCallService({
    sessionId,
    subtitle: 'Voice call is connecting',
  });

  ensureVoiceStreamsActive({
    micMuted: currentMicMuted,
    reason: 'before_join',
    speakerOn: false,
  });

  pendingJoin = new Promise((resolve, reject) => {
    activeChannelName = channelName;
    pendingJoinControls = { resolve, reject };

    registeredEventHandler = {
      onJoinChannelSuccess: () => {
        joinedChannelName = channelName;
        clearPendingJoin();
        logAgoraVoice('joinSuccess', {
          channelName,
          sessionId: sessionId || null,
        });
        ensureOngoingCallService({
          sessionId,
          subtitle: 'Voice call is active',
        }).catch(() => {});
        onJoinSuccess?.();
        resolve(0);
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
      onLocalAudioStateChanged: (_connection, state, reason) => {
        onLocalAudioStateChanged?.({ state, reason });
      },
      onRemoteAudioStateChanged: (_connection, remoteUid, state, reason) => {
        onRemoteAudioStateChanged?.({ remoteUid, state, reason });
      },
      onAudioRoutingChanged: (routing) => {
        onAudioRoutingChanged?.({ routing });
      },
      onAudioVolumeIndication: (_connection, speakers, _speakerNumber, totalVolume) => {
        onAudioVolumeIndication?.({
          totalVolume,
          speakers: Array.isArray(speakers) ? speakers : [],
        });
      },
    };

    engine.registerEventHandler(registeredEventHandler);

    pendingJoinTimeout = setTimeout(() => {
      cancelPendingJoin('Agora joinChannel timed out');
      logAgoraVoice('joinTimeout', {
        channelName,
      });
    }, 12000);

    logAgoraVoice('joinCalled', {
      channelName,
      uid: Number(uid) || 0,
      hasToken: Boolean(token),
      recoveringRejectedJoin,
    });

    try {
      // Ensure local mic capture + remote playback are fully enabled for this call.
      engine.setDefaultAudioRouteToSpeakerphone(false);

      if (AUTH_DEBUG_ENABLED) {
        engine.enableAudioVolumeIndication(300, 3, true);
      }
    } catch (_error) {
      // Ignore audio toggles; join still proceeds.
    }

    const joinResult = engine.joinChannel(token || '', channelName, Number(uid) || 0, {
      publishMicrophoneTrack: true,
      autoSubscribeAudio: true,
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    });

    if (joinResult < 0) {
      clearPendingJoin();
      activeChannelName = null;
      unregisterRtcEvents();
      logAgoraVoice('joinFailure', {
        channelName,
        code: joinResult,
        recoveringRejectedJoin,
        sessionId: sessionId || null,
      });
      if (joinResult === -17 && !recoveringRejectedJoin) {
        recoveringRejectedJoin = true;
        logAgoraVoice('joinRejectedRecovering', {
          channelName,
        });
        Promise.resolve()
          .then(() => leaveAgoraVoiceChannel())
          .catch(() => {})
          .then(() => {
            destroyAgoraVoiceEngine();
            return joinAgoraVoiceChannel({
              appId,
              token,
              channelName,
              uid,
              sessionId,
              onJoinSuccess,
              onUserJoined,
              onUserOffline,
              onConnectionStateChanged,
              onTokenWillExpire,
            });
          })
          .then(resolve)
          .catch(reject)
          .finally(() => {
            recoveringRejectedJoin = false;
          });
        return;
      }

      stopOngoingCallServiceIfNeeded({
        reason: 'join_failure',
      }).catch(() => {});
      reject(new Error(`Agora joinChannel failed with code ${joinResult}`));
    }
  });

  return pendingJoin;
};

export const muteLocalAudio = (muted) => {
  if (!rtcEngine) {
    return;
  }
  currentMicMuted = Boolean(muted);
  try {
    rtcEngine.enableAudio();
    rtcEngine.enableLocalAudio(true);
    rtcEngine.muteAllRemoteAudioStreams(false);
  } catch (_error) {
    // Keep mute handling best-effort if audio state re-assertion fails.
  }
  logAgoraVoice('micMuteChanged', {
    muted: currentMicMuted,
    speakerOn: currentSpeakerOn,
  });
  rtcEngine.muteLocalAudioStream(currentMicMuted);
  logAgoraVoice('micMuteStateApplied', {
    localAudioEnabled: true,
    remoteAudioEnabled: true,
    micMuted: currentMicMuted,
    speakerOn: currentSpeakerOn,
  });
};

export const setSpeakerEnabled = async (enabled, options = {}) => {
  if (!rtcEngine) {
    return;
  }

  const speakerOn = Boolean(enabled);
  currentSpeakerOn = speakerOn;
  currentMicMuted = Boolean(options?.isMicMuted);
  logAgoraVoice('speakerToggleRequested', {
    speakerOn,
    micMuted: currentMicMuted,
  });

  await updateCommunicationAudioRoute(speakerOn);
  ensureVoiceStreamsActive({
    micMuted: currentMicMuted,
    reason: options?.reason || 'speaker_toggle',
    speakerOn,
  });

  // On Android, prefer the communication-mode route selector, which avoids conflicts.
  try {
    if (Platform.OS === 'android' && typeof rtcEngine.setRouteInCommunicationMode === 'function') {
      logAgoraVoice('speakerRouteApplied', {
        speakerOn,
        route: speakerOn ? 3 : 1,
      });
      rtcEngine.setRouteInCommunicationMode(speakerOn ? 3 : 1);
      ensureVoiceStreamsActive({
        micMuted: currentMicMuted,
        reason: `${options?.reason || 'speaker_toggle'}_post_route`,
        speakerOn,
      });
      logAgoraVoice('speakerToggleApplied', {
        speakerOn,
        localAudioEnabled: true,
        remoteAudioEnabled: true,
        micMuted: currentMicMuted,
      });
      return;
    }
  } catch (_error) {
    // fall through to speakerphone toggle
  }

  try {
    logAgoraVoice('speakerRouteApplied', {
      speakerOn,
      route: speakerOn ? 'speakerphone' : 'earpiece',
    });
    rtcEngine.setEnableSpeakerphone(speakerOn);
  } catch (_error) {
    // ignore route failures
  }

  ensureVoiceStreamsActive({
    micMuted: currentMicMuted,
    reason: `${options?.reason || 'speaker_toggle'}_post_route`,
    speakerOn,
  });

  logAgoraVoice('speakerToggleApplied', {
    speakerOn,
    localAudioEnabled: true,
    remoteAudioEnabled: true,
    micMuted: currentMicMuted,
  });
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

  if (pendingLeave) {
    logAgoraVoice('leaveAwaitingExistingRequest', {
      channelName: activeChannelName,
    });
    return pendingLeave;
  }

  const channelName = activeChannelName || joinedChannelName;

  logAgoraVoice('leaveCalled', {
    channelName,
  });

  unregisterRtcEvents();
  cancelPendingJoin('Agora join cancelled: leaving channel');
  unregisterLeaveEvents();

  pendingLeave = new Promise((resolve) => {
    leaveEventHandler = {
      // `react-native-agora` emits `onLeaveChannel` after leaveChannel completes.
      onLeaveChannel: () => {
        logAgoraVoice('leaveSuccess', {
          channelName,
        });
        resolve(0);
      },
    };

    try {
      rtcEngine.registerEventHandler(leaveEventHandler);
    } catch (_error) {
      // Some SDK versions may not support multiple handlers; still proceed with a timeout fallback.
    }

    try {
      rtcEngine.leaveChannel();
    } catch (_error) {
      resolve(0);
    }

    pendingLeaveTimeout = setTimeout(() => {
      logAgoraVoice('leaveTimeout', {
        channelName,
      });
      resolve(0);
    }, 1500);
  })
    .catch(() => 0)
    .finally(() => {
      stopCommunicationAudioRoute().catch(() => {});
      stopOngoingCallServiceIfNeeded({
        reason: 'leave_channel',
      }).catch(() => {});
      if (pendingLeaveTimeout) {
        clearTimeout(pendingLeaveTimeout);
      }

      pendingLeaveTimeout = null;
      unregisterLeaveEvents();
      pendingLeave = null;
      activeChannelName = null;
      joinedChannelName = null;
      currentSpeakerOn = false;
    });

  return pendingLeave;
};

export const destroyAgoraVoiceEngine = () => {
  if (!rtcEngine) {
    return;
  }

  logAgoraVoice('engineCleanup', {
    channelName: activeChannelName,
  });

  cancelPendingJoin('Agora join cancelled: engine cleanup');
  if (pendingLeaveTimeout) {
    clearTimeout(pendingLeaveTimeout);
  }
  pendingLeaveTimeout = null;
  pendingLeave = null;
  unregisterLeaveEvents();
  unregisterRtcEvents();
  try {
    rtcEngine.leaveChannel();
  } catch (_error) {
    // Ignore leave errors; release still proceeds.
  }
  try {
    rtcEngine.release();
  } catch (_error) {
    // Ignore release errors during teardown.
  }

  rtcEngine = null;
  initializedAppId = null;
  activeChannelName = null;
  joinedChannelName = null;
  currentMicMuted = false;
  currentSpeakerOn = false;
  stopCommunicationAudioRoute().catch(() => {});
  stopOngoingCallServiceIfNeeded({
    reason: 'engine_cleanup',
  }).catch(() => {});
  clearPendingJoin();
};
