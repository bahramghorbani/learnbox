'use client';

import { useState } from 'react';

interface PronunciationButtonProps {
  text: string;
}

export function PronunciationButton({ text }: PronunciationButtonProps) {
  const [status, setStatus] = useState<'idle' | 'playing' | 'unavailable'>('idle');

  const play = () => {
    if (!('speechSynthesis' in window)) {
      setStatus('unavailable');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.82;
    utterance.onstart = () => setStatus('playing');
    utterance.onend = () => setStatus('idle');
    utterance.onerror = () => setStatus('unavailable');
    window.speechSynthesis.speak(utterance);
  };

  const label =
    status === 'playing'
      ? 'در حال پخش تلفظ'
      : status === 'unavailable'
        ? 'پخش تلفظ در این مرورگر در دسترس نیست'
        : `پخش تلفظ ${text}`;

  return (
    <button
      className={`audio-button ${status === 'playing' ? 'audio-button-playing' : ''}`}
      type="button"
      onClick={play}
      aria-label={label}
      title={label}
    >
      <SpeakerIcon />
      <span>{status === 'unavailable' ? 'صدا در دسترس نیست' : 'شنیدن تلفظ'}</span>
    </button>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10v4h4l5 4V6L8 10H4Z" fill="currentColor" />
      <path
        d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
