"use client";

import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Volume2, PlayCircle, AlertCircle, Mic, Square, Clock, GripVertical, ChevronDown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ── MATCH PAIRS ──────────────────────────────────────────────
function MatchPairs({ question, selectedAnswer, onSelect }) {
  const [matched, setMatched] = useState(selectedAnswer ? JSON.parse(selectedAnswer) : {});
  const [selectedLeft, setSelectedLeft] = useState(null);

  const rights = question.pairs.map(p => p.right);
  const shuffled = useRef([...rights].sort(() => Math.random() - 0.5)).current;

  const handleLeft = (left) => setSelectedLeft(selectedLeft === left ? null : left);

  const handleRight = (right) => {
    if (!selectedLeft) return;
    const newMatched = { ...matched, [selectedLeft]: right };
    setMatched(newMatched);
    onSelect(JSON.stringify(newMatched));
    setSelectedLeft(null);
  };

  const isMatched = (left) => matched[left] !== undefined;
  const isRightUsed = (right) => Object.values(matched).includes(right);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Colonne A</p>
        {question.pairs.map(({ left }) => (
          <button
            key={left}
            onClick={() => !isMatched(left) && handleLeft(left)}
            className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
              isMatched(left)
                ? 'border-[#17c3b2] bg-[#17c3b2]/10 text-[#00504e] cursor-default'
                : selectedLeft === left
                  ? 'border-purple-500 bg-purple-50 text-purple-800'
                  : 'border-gray-200 hover:border-[#17c3b2] hover:bg-gray-50'
            }`}
          >
            {isMatched(left) ? <span>✓ {left}</span> : left}
            {isMatched(left) && <span className="block text-xs text-[#17c3b2] mt-0.5">→ {matched[left]}</span>}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Colonne B</p>
        {shuffled.map((right) => (
          <button
            key={right}
            onClick={() => !isRightUsed(right) && handleRight(right)}
            className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-all ${
              isRightUsed(right)
                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-default'
                : selectedLeft
                  ? 'border-[#32cf8a] bg-green-50 hover:bg-green-100 cursor-pointer text-gray-800'
                  : 'border-gray-200 text-gray-600 cursor-default'
            }`}
          >
            {right}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── SENTENCE BUILDER ─────────────────────────────────────────
function SentenceBuilder({ question, selectedAnswer, onSelect }) {
  const shuffled = useRef([...question.words].sort(() => Math.random() - 0.5)).current;
  const [placed, setPlaced] = useState(selectedAnswer ? selectedAnswer.split('|') : []);
  const [remaining, setRemaining] = useState(() => {
    if (selectedAnswer) {
      const p = selectedAnswer.split('|');
      return shuffled.filter(w => !p.includes(w));
    }
    return shuffled;
  });

  const addWord = (word) => {
    const newPlaced = [...placed, word];
    const newRemaining = remaining.filter((_, i) => remaining.indexOf(word) !== i ? true : false);
    // remove first occurrence
    const idx = remaining.indexOf(word);
    const nr = [...remaining];
    nr.splice(idx, 1);
    setPlaced(newPlaced);
    setRemaining(nr);
    onSelect(newPlaced.join('|'));
  };

  const removeWord = (index) => {
    const word = placed[index];
    const newPlaced = placed.filter((_, i) => i !== index);
    setPlaced(newPlaced);
    setRemaining([...remaining, word]);
    onSelect(newPlaced.join('|'));
  };

  return (
    <div className="space-y-4">
      {/* Zone de construction */}
      <div className="min-h-[56px] border-2 border-dashed border-[#17c3b2] rounded-xl p-3 flex flex-wrap gap-2 bg-[#17c3b2]/5">
        {placed.length === 0 && <span className="text-gray-400 text-sm italic">Cliquez sur les mots pour les placer ici…</span>}
        {placed.map((word, i) => (
          <button
            key={i}
            onClick={() => removeWord(i)}
            className="px-3 py-1.5 bg-[#17c3b2] text-white rounded-lg text-sm font-medium hover:bg-red-400 transition-colors"
            title="Cliquer pour retirer"
          >
            {word}
          </button>
        ))}
      </div>
      {/* Mots disponibles */}
      <div className="flex flex-wrap gap-2">
        {remaining.map((word, i) => (
          <button
            key={i}
            onClick={() => addWord(word)}
            className="px-3 py-1.5 border-2 border-gray-300 rounded-lg text-sm font-medium hover:border-[#17c3b2] hover:bg-[#17c3b2]/10 transition-colors"
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── CATEGORIZE ───────────────────────────────────────────────
function Categorize({ question, selectedAnswer, onSelect }) {
  const [assignments, setAssignments] = useState(selectedAnswer ? JSON.parse(selectedAnswer) : {});

  const assign = (itemText, category) => {
    const newAssignments = { ...assignments, [itemText]: category };
    setAssignments(newAssignments);
    onSelect(JSON.stringify(newAssignments));
  };

  return (
    <div className="space-y-4">
      {question.categories.map((cat, ci) => (
        <div key={cat} className="border-2 border-gray-200 rounded-xl p-3">
          <p className="text-sm font-bold text-gray-700 mb-2">{cat}</p>
          <div className="flex flex-wrap gap-2 min-h-[32px]">
            {question.items
              .filter(item => assignments[item.text] === cat)
              .map(item => (
                <button
                  key={item.text}
                  onClick={() => assign(item.text, null)}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-medium hover:bg-red-100 hover:text-red-700 transition-colors"
                  title="Retirer"
                >
                  {item.text}
                </button>
              ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 mt-2">
        <p className="w-full text-xs text-gray-500 mb-1">Cliquez sur un élément pour l'assigner :</p>
        {question.items
          .filter(item => !assignments[item.text])
          .map(item => (
            <div key={item.text} className="relative group">
              <span className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 cursor-pointer">{item.text}</span>
              <div className="absolute bottom-full left-0 mb-1 hidden group-hover:flex flex-col gap-1 z-10 bg-white shadow-lg border border-gray-200 rounded-lg p-2">
                {question.categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => assign(item.text, cat)}
                    className="text-xs px-3 py-1 rounded hover:bg-[#17c3b2]/10 text-left whitespace-nowrap"
                  >
                    → {cat}
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── ORDER SENTENCES ──────────────────────────────────────────
function OrderSentences({ question, selectedAnswer, onSelect }) {
  const shuffled = useRef([...question.sentences].map((s, i) => ({ text: s, origIdx: i })).sort(() => Math.random() - 0.5)).current;
  const [order, setOrder] = useState(selectedAnswer ? JSON.parse(selectedAnswer) : []);
  const [remaining, setRemaining] = useState(() => {
    if (selectedAnswer) {
      const placed = JSON.parse(selectedAnswer);
      return shuffled.filter(s => !placed.find(p => p.origIdx === s.origIdx));
    }
    return shuffled;
  });

  const addSentence = (item) => {
    const newOrder = [...order, item];
    setOrder(newOrder);
    setRemaining(remaining.filter(r => r.origIdx !== item.origIdx));
    onSelect(JSON.stringify(newOrder));
  };

  const removeSentence = (index) => {
    const item = order[index];
    const newOrder = order.filter((_, i) => i !== index);
    setOrder(newOrder);
    setRemaining([...remaining, item]);
    onSelect(JSON.stringify(newOrder));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase">Votre ordre :</p>
        <div className="min-h-[48px] border-2 border-dashed border-[#17c3b2] rounded-xl p-2 space-y-2 bg-[#17c3b2]/5">
          {order.length === 0 && <p className="text-gray-400 text-sm italic p-1">Ajoutez les phrases dans l'ordre…</p>}
          {order.map((item, i) => (
            <div key={item.origIdx} className="flex items-center gap-2 bg-white border border-[#17c3b2] rounded-lg px-3 py-2">
              <span className="text-xs font-bold text-[#17c3b2] w-5 shrink-0">{i + 1}.</span>
              <span className="text-sm flex-1">{item.text}</span>
              <button onClick={() => removeSentence(i)} className="text-gray-400 hover:text-red-400 text-xs shrink-0">✕</button>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase">Phrases disponibles :</p>
        {remaining.map((item) => (
          <button
            key={item.origIdx}
            onClick={() => addSentence(item)}
            className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm hover:border-[#17c3b2] hover:bg-[#17c3b2]/5 transition-colors"
          >
            {item.text}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── WORD CHOICE TEXT ─────────────────────────────────────────
function WordChoiceText({ question, selectedAnswer, onSelect }) {
  const [choices, setChoices] = useState(() => {
    if (selectedAnswer) return JSON.parse(selectedAnswer);
    return {};
  });

  const setChoice = (blankIdx, value) => {
    const newChoices = { ...choices, [blankIdx]: value };
    setChoices(newChoices);
    onSelect(JSON.stringify(newChoices));
  };

  let blankCounter = 0;
  return (
    <div className="bg-gray-50 rounded-xl p-4 text-base leading-relaxed">
      {question.textParts.map((part, i) => {
        if (typeof part === 'string') {
          return <span key={i} className="whitespace-pre-wrap">{part}</span>;
        } else {
          const idx = part.blank;
          blankCounter++;
          return (
            <select
              key={i}
              value={choices[idx] || ''}
              onChange={(e) => setChoice(idx, e.target.value)}
              className="inline-block mx-1 px-2 py-1 border-2 border-[#17c3b2] rounded-lg text-sm font-semibold bg-white text-[#00504e] focus:outline-none"
            >
              <option value="">— choisir —</option>
              {part.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          );
        }
      })}
    </div>
  );
}

// ── COMPLETE FORM ────────────────────────────────────────────
function CompleteForm({ question, selectedAnswer, onSelect }) {
  const [fields, setFields] = useState(() => {
    if (selectedAnswer) return JSON.parse(selectedAnswer);
    return {};
  });

  const setField = (key, value) => {
    const newFields = { ...fields, [key]: value };
    setFields(newFields);
    onSelect(JSON.stringify(newFields));
  };

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-900 mb-4">
        <p className="font-semibold mb-1">📋 Informations à utiliser :</p>
        <p>{question.context}</p>
      </div>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wide">
          Formulaire à compléter
        </div>
        <div className="p-4 space-y-3">
          {question.formFields.map((field) => (
            <div key={field.key} className="grid grid-cols-2 gap-3 items-center">
              <label className="text-sm font-medium text-gray-700">{field.label} :</label>
              <Input
                value={fields[field.key] || ''}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder="Votre réponse…"
                className="text-sm"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── TRUE FALSE JUSTIFY ───────────────────────────────────────
function TrueFalseJustify({ question, selectedAnswer, onSelect }) {
  const [tfAnswer, setTfAnswer] = useState(selectedAnswer ? JSON.parse(selectedAnswer).tf : '');
  const [justification, setJustification] = useState(selectedAnswer ? JSON.parse(selectedAnswer).justif : '');

  const update = (tf, justif) => {
    onSelect(JSON.stringify({ tf, justif }));
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-800 italic leading-relaxed">
        {question.passage}
      </div>
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm font-semibold text-yellow-900">
        Affirmation : « {question.statement} »
      </div>
      <div className="flex gap-3">
        {['Vrai', 'Faux'].map(opt => (
          <button
            key={opt}
            onClick={() => { setTfAnswer(opt); update(opt, justification); }}
            className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${
              tfAnswer === opt
                ? opt === 'Vrai' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700'
                : 'border-gray-200 hover:border-gray-400'
            }`}
          >
            {opt === 'Vrai' ? '✓ Vrai' : '✗ Faux'}
          </button>
        ))}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1">Justifiez en citant un extrait du texte :</p>
        <Input
          value={justification}
          onChange={(e) => { setJustification(e.target.value); update(tfAnswer, e.target.value); }}
          placeholder="Extrait du texte qui justifie votre réponse…"
          className="text-sm"
        />
      </div>
    </div>
  );
}

// ── EMAIL RESPONSE ───────────────────────────────────────────
function EmailResponse({ question, selectedAnswer, onSelect }) {
  return (
    <div className="space-y-4">
      <div className="border border-gray-200 rounded-xl overflow-hidden text-sm">
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 space-y-1 text-xs text-gray-600">
          <div><span className="font-semibold text-gray-700 w-14 inline-block">De :</span> {question.emailFrom}</div>
          <div><span className="font-semibold text-gray-700 w-14 inline-block">Objet :</span> {question.emailSubject}</div>
        </div>
        <div className="px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-line">
          {question.emailBody}
        </div>
      </div>
      <div className="space-y-2">
        {question.options.map((opt, i) => {
          const isSelected = selectedAnswer === opt;
          return (
            <motion.button
              key={i}
              onClick={() => onSelect(opt)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left text-sm ${
                isSelected
                  ? 'border-[#17c3b2] bg-[#17c3b2]/5 text-[#00504e] font-medium'
                  : 'border-gray-200 hover:border-[#32cf8a] hover:bg-gray-50 text-gray-700'
              }`}
            >
              {isSelected && <CheckCircle2 className="w-4 h-4 inline mr-2 text-[#17c3b2]" />}
              {opt}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ── READ COMPREHENSION ───────────────────────────────────────
function ReadComprehension({ question, selectedAnswer, onSelect }) {
  return (
    <div className="space-y-4">
      <div className="bg-slate-50 border-l-4 border-[#17c3b2] rounded-r-xl px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-line">
        {question.passage}
      </div>
      <div className="space-y-2">
        {question.options.map((opt, i) => {
          const letters = ['A', 'B', 'C', 'D'];
          const isSelected = selectedAnswer === opt;
          return (
            <motion.button
              key={i}
              onClick={() => onSelect(opt)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 text-left group ${
                isSelected ? 'border-[#17c3b2] bg-[#17c3b2]/5 shadow-md' : 'border-gray-200 hover:border-[#32cf8a] hover:bg-gray-50'
              }`}
            >
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center font-semibold text-sm shrink-0 ${
                isSelected ? 'bg-[#17c3b2] text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {isSelected ? <CheckCircle2 className="w-4 h-4" /> : letters[i]}
              </span>
              <span className={`text-sm font-medium ${isSelected ? 'text-[#00504e]' : 'text-gray-700'}`}>{opt}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ── FILL KEYBOARD ────────────────────────────────────────────
function FillKeyboard({ question, selectedAnswer, onSelect }) {
  const parts = question.template.split('___');
  const hasMultipleBlanks = parts.length > 2;

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-4 text-base font-medium text-gray-800 leading-loose">
        {parts.map((part, i, arr) => (
          <span key={i}>
            <span className="whitespace-pre-wrap">{part}</span>
            {i < arr.length - 1 && (
              <input
                type="text"
                value={hasMultipleBlanks
                  ? (selectedAnswer || '').split(',')[i]?.trim() || ''
                  : selectedAnswer || ''}
                onChange={(e) => {
                  if (hasMultipleBlanks) {
                    const current = (selectedAnswer || '').split(',');
                    current[i] = e.target.value;
                    onSelect(current.join(','));
                  } else {
                    onSelect(e.target.value);
                  }
                }}
                placeholder="…"
                className="inline-block mx-2 px-2 py-0.5 border-b-2 border-[#17c3b2] bg-transparent text-[#00504e] font-semibold focus:outline-none text-center"
                style={{ width: `${Math.max(80, (hasMultipleBlanks ? 120 : 160))}px` }}
                autoFocus={i === 0}
              />
            )}
          </span>
        ))}
      </div>
      <p className="text-xs text-gray-500 italic">
        💡 Saisissez votre réponse directement dans le trou ci-dessus.
        {hasMultipleBlanks && ' Complétez chaque trou séparément.'}
      </p>
    </div>
  );
}

// ── ODD ONE OUT ──────────────────────────────────────────────
function OddOneOut({ question, selectedAnswer, onSelect }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {question.options.map((opt, i) => {
        const isSelected = selectedAnswer === opt;
        return (
          <motion.button
            key={i}
            onClick={() => onSelect(opt)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`p-4 rounded-xl border-2 font-medium text-sm transition-all ${
              isSelected
                ? 'border-red-400 bg-red-50 text-red-700'
                : 'border-gray-200 hover:border-red-300 hover:bg-red-50/50 text-gray-700'
            }`}
          >
            {isSelected && '🚫 '}{opt}
          </motion.button>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SYNTHÈSE VOCALE (accessibilité non-lecteurs)
// ══════════════════════════════════════════════════════════════

// Niveaux où l'on lit tout à voix haute : le public alpha/débutant ne sait pas
// forcément lire — la consigne et les réponses doivent s'écouter.
const LOW_LEVELS = ['Pré-alpha', 'Alpha', 'A1.1', 'A1', 'A2'];

export function speak(text, { rate = 0.8 } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
  const spaced = text.replace(/\?/g, ' ?').replace(/!/g, ' !').replace(/,/g, ', ').replace(/\./g, '. ');
  const utterance = new SpeechSynthesisUtterance(spaced);
  utterance.lang = 'fr-FR';
  utterance.rate = rate;
  utterance.pitch = 1.15;
  const voices = window.speechSynthesis.getVoices();
  const frVoice = voices.find(v => v.lang.startsWith('fr') && (v.name.includes('Enhanced') || v.name.includes('Google') || v.name.includes('Thomas')))
    || voices.find(v => v.lang.startsWith('fr'));
  if (frVoice) utterance.voice = frVoice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

// Types où écouter les OPTIONS ne fausse pas la compétence testée
// (on n'audio-lit jamais un exercice de lecture : ce serait donner la réponse).
const OPTION_AUDIO_TYPES = ['listen_choose', 'scenario_tree', 'safety_instruction', 'fill_in_blank', 'complete_dialogue'];

// ══════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function QuestionCard({ question, selectedAnswer, onSelect, questionNumber, timeLeft, onStartTimer }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const lowLevel = LOW_LEVELS.includes(question.level) && !question.noAudio;
  const optionAudio = lowLevel && OPTION_AUDIO_TYPES.includes(question.type);

  // Bas niveaux : la consigne est lue automatiquement à l'affichage de la question
  // (l'audio de contenu — audioText — reste déclenché par le bouton « Écouter »).
  useEffect(() => {
    if (!lowLevel) return;
    const timer = setTimeout(() => speak(question.question), 400);
    return () => {
      clearTimeout(timer);
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  const playAudio = () => {
    if (!question.audioText) return;
    setIsPlaying(true);
    let text = question.audioText.replace(/\?/g, ' ?').replace(/!/g, ' !').replace(/,/g, ', ').replace(/\./g, '. ');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.8;
    utterance.pitch = 1.15;
    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(v => v.lang.startsWith('fr') && (v.name.includes('Enhanced') || v.name.includes('Google') || v.name.includes('Thomas')))
      || voices.find(v => v.lang.startsWith('fr'));
    if (frVoice) utterance.voice = frVoice;
    utterance.onend = () => {
      setIsPlaying(false);
      if (question.type === 'oral' && onStartTimer) onStartTimer();
    };
    utterance.onerror = () => setIsPlaying(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const startRecording = async () => {
    setError('');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError("Votre navigateur ne supporte pas l'enregistrement. Utilisez Chrome ou Edge."); return; }
    const recognition = new SR();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;
    let finalTranscript = '';
    recognition.onresult = (event) => {
      setError('');
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += t + ' ';
        else interim += t;
      }
      onSelect(finalTranscript + interim);
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') setError("Permission micro refusée.");
      else setError("Erreur d'enregistrement. Saisissez manuellement ci-dessous.");
      setIsRecording(false);
      clearInterval(timerRef.current);
    };
    recognition.onend = () => { setIsRecording(false); clearInterval(timerRef.current); };
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
  };

  const stopRecording = () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    setIsRecording(false);
    clearInterval(timerRef.current);
  };

  const timerColor = timeLeft === null ? '' : timeLeft <= 10 ? 'bg-red-100 text-red-700' : timeLeft <= 20 ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={questionNumber}
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -50 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full"
      >
        {/* Badges niveau + timer */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Bloc littératie : jamais de niveau affiché au candidat (restitution valorisante) */}
            {question.block !== 'litteratie' && (
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-[#17c3b2]/10 text-[#00504e]">Niveau {question.level}</span>
            )}
            <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">{question.category}</span>
          </div>
          {timeLeft !== null && timeLeft !== undefined && (
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${timerColor}`}>
              <Clock className={`w-4 h-4 ${timeLeft <= 10 ? 'animate-pulse' : ''}`} />
              <span className="font-semibold text-sm">{timeLeft}s</span>
            </div>
          )}
        </div>

        {/* Audio player */}
        {question.audioText && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
            <Alert className="bg-gradient-to-r from-[#17c3b2]/10 to-[#32cf8a]/10 border-[#17c3b2]/30">
              <Volume2 className="h-5 w-5 text-[#00504e]" />
              <AlertDescription className="ml-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-[#00504e] mb-0.5">Question audio</p>
                    <p className="text-sm text-gray-600">Cliquez pour écouter l'extrait</p>
                  </div>
                  <Button onClick={playAudio} disabled={isPlaying} className="bg-[#00504e] hover:bg-[#17c3b2] shrink-0">
                    <PlayCircle className={`w-4 h-4 mr-2 ${isPlaying ? 'animate-pulse' : ''}`} />
                    {isPlaying ? 'En lecture…' : 'Écouter'}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Contextes spécifiques */}
        {question.type === 'safety_instruction' && (
          <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
            <span className="text-3xl">{question.safetyIcon}</span>
            <p className="text-sm font-semibold text-amber-900">{question.safetyLabel}</p>
          </div>
        )}
        {question.type === 'scenario_tree' && question.context && (
          <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-900 font-medium">{question.context}</div>
        )}
        {question.type === 'fill_in_blank' && question.template && (
          <div className="mb-4 rounded-xl bg-gray-100 px-5 py-4 text-lg font-medium text-gray-800">
            {question.template.split('___').map((part, i, arr) => (
              <span key={i}>{part}{i < arr.length - 1 && (
                <span className="inline-block border-b-2 border-[#17c3b2] min-w-[80px] mx-1 text-[#17c3b2] font-bold">{selectedAnswer || '___'}</span>
              )}</span>
            ))}
          </div>
        )}
        {question.type === 'complete_dialogue' && question.dialogue && (
          <div className="mb-4 space-y-2">
            {question.dialogue.map((line, i) => (
              <div key={i} className={`flex gap-3 items-start ${line.speaker === 'Employé' || line.speaker === 'Candidat' ? 'flex-row-reverse' : ''}`}>
                <span className="shrink-0 text-xs font-bold bg-gray-200 rounded px-2 py-1 mt-0.5">{line.speaker}</span>
                <div className={`rounded-xl px-4 py-2 text-sm max-w-xs ${line.speaker === 'Employé' || line.speaker === 'Candidat' ? 'bg-[#17c3b2]/10 text-[#00504e]' : 'bg-gray-100 text-gray-800'}`}>
                  {line.text === '___' ? <span className="text-gray-400 italic">[Votre réponse]</span> : line.text}
                </div>
              </div>
            ))}
          </div>
        )}
        {question.type === 'reformulate' && question.originalText && (
          <div className="mb-4 rounded-xl bg-orange-50 border border-orange-200 px-4 py-3">
            <p className="text-xs text-orange-600 font-semibold mb-1">Phrase à reformuler :</p>
            <p className="text-base font-medium text-gray-800">« {question.originalText} »</p>
          </div>
        )}

        {/* Question (avec réécoute de la consigne pour les bas niveaux) */}
        <div className="mb-5 md:mb-6 flex items-start gap-3">
          <h2 className="flex-1 text-lg md:text-2xl font-semibold text-gray-900 leading-relaxed">{question.question}</h2>
          {lowLevel && (
            <button
              type="button"
              onClick={() => speak(question.question)}
              className="mt-1 shrink-0 rounded-full bg-[#17c3b2]/10 p-2.5 text-[#00504e] transition-colors hover:bg-[#17c3b2]/25"
              title="Écouter la consigne"
              aria-label="Écouter la consigne"
            >
              <Volume2 className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Stimulus de lecture (bloc littératie) : affiché en grand, JAMAIS prononcé */}
        {question.stimulus && (
          <div className={`mb-6 rounded-2xl border-2 border-gray-200 bg-white px-6 py-8 text-center font-semibold tracking-wide text-gray-900 ${question.stimulus.length <= 8 ? 'text-5xl' : 'text-3xl'}`}>
            {question.stimulus}
          </div>
        )}

        {/* Rendu selon le type */}
        {question.type === 'big_choice' ? (
          // Bloc littératie : très grandes tuiles tactiles (emoji, lettres, mots courts),
          // sélection au premier appui (l'option textuelle est lue sauf noAudio).
          <div className={`grid gap-4 ${question.options.length <= 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
            {question.options.map((option, index) => {
              const isSelected = selectedAnswer === option;
              const isEmoji = /^\p{Extended_Pictographic}/u.test(option) && option.length <= 4;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    onSelect(option);
                    if (!question.noAudio && !isEmoji) speak(option);
                  }}
                  className={`flex min-h-[110px] items-center justify-center rounded-2xl border-4 p-4 text-center transition-all active:scale-95 ${
                    isSelected ? 'border-[#17c3b2] bg-[#17c3b2]/10 shadow-lg' : 'border-gray-200 bg-white hover:border-[#32cf8a]'
                  } ${isEmoji ? 'text-6xl' : question.bigText ? 'text-4xl font-bold tracking-wide' : 'text-xl font-semibold'}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        ) : question.type === 'oral' ? (
          <div className="space-y-4">
            <Alert className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
              <Mic className="h-4 w-4 text-purple-600" />
              <AlertDescription className="text-purple-900 text-sm">
                Enregistrez votre réponse (minimum <strong>{question.minDuration}s</strong>) ou saisissez-la.
              </AlertDescription>
            </Alert>
            {error && <Alert className="bg-red-50 border-red-200"><AlertCircle className="h-4 w-4 text-red-600" /><AlertDescription className="text-red-900 text-sm">{error}</AlertDescription></Alert>}
            <div className="bg-gray-50 rounded-xl p-6 text-center">
              {!isRecording ? (
                <Button onClick={startRecording} className="h-14 px-8 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90" size="lg">
                  <Mic className="w-5 h-5 mr-2" />Commencer l'enregistrement
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-2xl font-bold">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
                  </div>
                  <Button onClick={stopRecording} className="h-12 px-8 bg-red-600 hover:bg-red-700"><Square className="w-4 h-4 mr-2" />Arrêter</Button>
                </div>
              )}
            </div>
            <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-300" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-500">Ou saisir manuellement</span></div></div>
            <Textarea value={selectedAnswer || ''} onChange={(e) => onSelect(e.target.value)} placeholder="Tapez votre réponse ici…" className="min-h-[100px] text-base resize-none" />
          </div>
        ) : question.type === 'written' ? (
          <div className="space-y-3">
            <Alert className="bg-blue-50 border-blue-200"><AlertCircle className="h-4 w-4 text-blue-600" /><AlertDescription className="text-blue-900 text-sm">Rédigez votre réponse en au moins <strong>{question.minWords} mots</strong>.</AlertDescription></Alert>
            <Textarea value={selectedAnswer || ''} onChange={(e) => onSelect(e.target.value)} placeholder={question.placeholder} className="min-h-[180px] text-base leading-relaxed resize-none" />
            <div className="text-right text-sm text-gray-500">{(selectedAnswer || '').split(/\s+/).filter(w => w.length > 0).length} / {question.minWords} mots</div>
          </div>
        ) : question.type === 'reformulate' ? (
          <div className="space-y-3">
            <Alert className="bg-orange-50 border-orange-200"><AlertCircle className="h-4 w-4 text-orange-600" /><AlertDescription className="text-orange-900 text-sm">Minimum <strong>{question.minWords} mots</strong>, ton professionnel.</AlertDescription></Alert>
            <Textarea value={selectedAnswer || ''} onChange={(e) => onSelect(e.target.value)} placeholder={question.placeholder} className="min-h-[100px] text-base resize-none" />
            <div className="text-right text-sm text-gray-500">{(selectedAnswer || '').split(/\s+/).filter(w => w.length > 0).length} mots</div>
          </div>
        ) : question.type === 'match_pairs' ? (
          <MatchPairs question={question} selectedAnswer={selectedAnswer} onSelect={onSelect} />
        ) : question.type === 'sentence_builder' ? (
          <SentenceBuilder question={question} selectedAnswer={selectedAnswer} onSelect={onSelect} />
        ) : question.type === 'categorize' ? (
          <Categorize question={question} selectedAnswer={selectedAnswer} onSelect={onSelect} />
        ) : question.type === 'order_sentences' ? (
          <OrderSentences question={question} selectedAnswer={selectedAnswer} onSelect={onSelect} />
        ) : question.type === 'word_choice_text' ? (
          <WordChoiceText question={question} selectedAnswer={selectedAnswer} onSelect={onSelect} />
        ) : question.type === 'complete_form' ? (
          <CompleteForm question={question} selectedAnswer={selectedAnswer} onSelect={onSelect} />
        ) : question.type === 'true_false_justify' ? (
          <TrueFalseJustify question={question} selectedAnswer={selectedAnswer} onSelect={onSelect} />
        ) : question.type === 'email_response' ? (
          <EmailResponse question={question} selectedAnswer={selectedAnswer} onSelect={onSelect} />
        ) : question.type === 'read_comprehension' ? (
          <ReadComprehension question={question} selectedAnswer={selectedAnswer} onSelect={onSelect} />
        ) : question.type === 'fill_keyboard' ? (
          <FillKeyboard question={question} selectedAnswer={selectedAnswer} onSelect={onSelect} />
        ) : question.type === 'odd_one_out' ? (
          <OddOneOut question={question} selectedAnswer={selectedAnswer} onSelect={onSelect} />
        ) : (
          // QCM standard
          <div className="space-y-3">
            {question.options.map((option, index) => {
              const isSelected = selectedAnswer === option;
              const letters = ['A', 'B', 'C', 'D'];
              return (
                <motion.button
                  key={index}
                  onClick={() => onSelect(option)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className={`w-full p-3 md:p-4 rounded-xl border-2 transition-all flex items-center gap-3 md:gap-4 text-left group ${
                    isSelected ? 'border-[#17c3b2] bg-[#17c3b2]/5 shadow-md' : 'border-gray-200 hover:border-[#32cf8a] hover:bg-gray-50'
                  }`}
                >
                  <span className={`w-9 h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center font-semibold text-sm transition-all shrink-0 ${
                    isSelected ? 'bg-[#17c3b2] text-white' : 'bg-gray-100 text-gray-600 group-hover:bg-[#32cf8a]/20 group-hover:text-[#00504e]'
                  }`}>
                    {isSelected ? <CheckCircle2 className="w-5 h-5" /> : letters[index]}
                  </span>
                  <span className={`flex-1 font-medium ${isSelected ? 'text-[#00504e]' : 'text-gray-700'}`}>{option}</span>
                  {optionAudio && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); speak(option); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); speak(option); } }}
                      className="shrink-0 rounded-full p-2 text-gray-400 transition-colors hover:bg-[#17c3b2]/15 hover:text-[#00504e]"
                      title="Écouter cette réponse"
                      aria-label="Écouter cette réponse"
                    >
                      <Volume2 className="h-4 w-4" />
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}