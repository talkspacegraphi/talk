import { create } from 'zustand';
import type { UserBasic, CallInfo } from '../lib/types';

export interface CallStateData {
  isOpen: boolean;
  targetUser: UserBasic | null;
  callType: 'voice' | 'video';
  incoming: CallInfo | null;
  sessionId: number;
}

export interface GroupCallStateData {
  isOpen: boolean;
  chatId: string;
  chatName: string;
  callType: 'voice' | 'video';
  sessionId: number;
}

interface CallStore {
  call: CallStateData;
  groupCall: GroupCallStateData;
  startCall: (targetUser: UserBasic, type: 'voice' | 'video') => void;
  startGroupCall: (chatId: string, chatName: string, type: 'voice' | 'video') => void;
  closeCall: () => void;
  closeGroupCall: () => void;
  setIncomingCall: (data: CallInfo) => void;
  setCallType: (type: 'voice' | 'video') => void;
}

export const useCallStore = create<CallStore>((set) => ({
  call: {
    isOpen: false,
    targetUser: null,
    callType: 'voice',
    incoming: null,
    sessionId: 0,
  },
  groupCall: {
    isOpen: false,
    chatId: '',
    chatName: '',
    callType: 'voice',
    sessionId: 0,
  },

  startCall: (targetUser, callType) =>
    set((s) => ({
      call: {
        isOpen: true,
        targetUser,
        callType,
        incoming: null,
        sessionId: s.call.sessionId + 1,
      },
    })),

  startGroupCall: (chatId, chatName, callType) =>
    set((s) => ({
      groupCall: {
        isOpen: true,
        chatId,
        chatName,
        callType,
        sessionId: s.groupCall.sessionId + 1,
      },
    })),

  closeCall: () =>
    set((s) => ({
      call: {
        ...s.call,
        isOpen: false,
        targetUser: null,
        incoming: null,
      },
    })),

  closeGroupCall: () =>
    set((s) => ({
      groupCall: {
        ...s.groupCall,
        isOpen: false,
      },
    })),

  setIncomingCall: (data) =>
    set((s) => ({
      call: {
        isOpen: true,
        targetUser: null,
        callType: data.callType,
        incoming: data,
        sessionId: s.call.sessionId + 1,
      },
    })),

  setCallType: (callType) =>
    set((s) => ({
      call: { ...s.call, callType },
    })),
}));
