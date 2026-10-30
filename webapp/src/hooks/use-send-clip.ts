import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage, type Clip } from '@/lib/api';
import { useClips } from '@/lib/clips';
import { canShareMessages, haptic, inTelegram, shareMessage } from '@/lib/telegram';

/** Sends a clip through Telegram's "share to chat" picker. */
export function useSendClip() {
  const { me, markUsed } = useClips();
  const [sendingId, setSendingId] = useState<number | null>(null);

  async function send(clip: Clip) {
    if (!canShareMessages) {
      const inline = me?.botUsername ? ` or type @${me.botUsername} in a chat` : '';
      toast.error(
        inTelegram
          ? `Update Telegram to send from here${inline}.`
          : 'Open the soundboard inside Telegram to send clips.',
      );
      return;
    }

    haptic.tap();
    setSendingId(clip.id);
    try {
      const preparedMessageId = await api.prepareShare(clip.id);
      markUsed(clip.id);
      if (await shareMessage(preparedMessageId)) haptic.success();
    } catch (error) {
      haptic.error();
      toast.error(errorMessage(error));
    } finally {
      setSendingId(null);
    }
  }

  return { send, sendingId };
}
