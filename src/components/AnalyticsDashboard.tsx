import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Award, CheckCircle,
  AlertTriangle, Sparkles, Volume2
} from 'lucide-react';
import { VocabWord, UserStats, PronunciationAssessment } from '../types';
import { speakFrench } from '../utils/frenchSpeech';

interface AnalyticsDashboardProps {
  stats: UserStats;
  vocabList: VocabWord[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  stats,
  vocabList,
}) => {
  const { t, i18n } = useTranslation();
  const masteredCount = vocabList.filter((w) => w.repetitions >= 4).length;
  const learningCount = vocabList.filter((w) => w.repetitions > 0 && w.repetitions < 4).length;
  const newCount = vocabList.filter((w) => w.repetitions === 0).length;

  const isEn = i18n.language !== 'zh';

  const phonemeChecklist = [
    {
      phoneme: '[ʁ]',
      name: isEn ? 'Uvular Fricative R' : '小舌颤音/擦音',
      examples: 'Paris, regarder, apprendre',
      difficulty: isEn ? 'Characteristic French sound' : '中国学习者最高频难点',
      status: 'good',
      tip: isEn ? 'Keep tongue tip down behind lower teeth, slight vibration at soft palate.' : '舌尖抵住下齿背，舌根稍向软腭抬起，让气流经小舌间隙摩擦发出轻微振动，切忌发出喉咙呼噜水声。',
    },
    {
      phoneme: '[y]',
      name: isEn ? 'Close Front Rounded Vowel' : '闭前圆唇元音',
      examples: 'tu, lune, musique',
      difficulty: isEn ? 'Distinct from /u/ and /i/' : '易误读为拼音 u 或 iou',
      status: 'needs_work',
      tip: isEn ? 'Position tongue as for [i], but firmly round lips forward into a small circle.' : '舌位完全如同发汉语的“衣”[i]，但嘴唇要极端向前收缩成紧致的小圆圈，保持圆唇固定。',
    },
    {
      phoneme: '[ɑ̃]',
      name: 'Nasal [ɑ̃]',
      examples: 'enfant, temps, champ',
      difficulty: isEn ? 'Open back nasal vowel' : '易带有末尾辅音 /n/',
      status: 'good',
      tip: isEn ? 'Drop soft palate with tongue low in back; do not close lips into an "n".' : '口腔张大至类似发[a]，同时软腭自然下垂，气流均匀由口鼻同时逸出，千万不要在结尾闭口形成辅音n。',
    },
    {
      phoneme: '[ɛ̃]',
      name: 'Nasal [ɛ̃]',
      examples: 'matin, plein, vin',
      difficulty: isEn ? 'Front unrounded nasal' : '易误读成拼音 en',
      status: 'needs_work',
      tip: isEn ? 'Slightly spread corners of mouth as in [ɛ], resonating air through nasal cavity.' : '嘴角向两旁微微咧开，发类似[ɛ]的口腔姿态，软腭下垂通气，声音在鼻腔产生清亮共鸣。',
    },
    {
      phoneme: '[ɔ̃]',
      name: 'Nasal [ɔ̃]',
      examples: 'bonbon, monde, ombre',
      difficulty: isEn ? 'Rounded back nasal' : '易与 [ɑ̃] 混淆',
      status: 'mastered',
      tip: isEn ? 'Lips rounded tightly, tongue drawn back, resonance in both oral and nasal passages.' : '双唇收成圆小孔，舌身向后退缩，声音浑厚圆润，口鼻同时出气。',
    },
    {
      phoneme: 'Liaison',
      name: isEn ? 'Obligatory Liaison' : '法定联诵与连音',
      examples: 'les_amis [z], un_homme [n]',
      difficulty: isEn ? 'Liaison rules' : '必须联诵 vs 禁止联诵',
      status: 'good',
      tip: isEn ? 'Pronounce normally silent final consonant before vowel: article + noun, pronoun + verb.' : '冠词+名词、主格人称代词+动词必须联诵；连词 et 以及某些特定副词之后绝对禁止联诵。',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-french-serif font-bold text-2xl text-stone-900 flex items-center gap-2">
            <span>{t('analytics.title')}</span>
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            {t('analytics.subtitle')}
          </p>
        </div>
      </div>

      {/* Summary */}
      <dl className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-stone-200 rounded-xl border border-stone-200 bg-white">
        <div className="p-4 space-y-1">
          <dt className="text-xs text-stone-500">{t('analytics.wordsLearned')}</dt>
          <dd className="text-2xl font-french-serif font-semibold text-stone-900">{vocabList.length}</dd>
          <dd className="text-[11px] text-stone-500">{t('vocab.mastered')}: {masteredCount}</dd>
        </div>
        <div className="p-4 space-y-1">
          <dt className="text-xs text-stone-500">{t('analytics.avgScore')}</dt>
          <dd className="text-2xl font-french-serif font-semibold text-stone-900">
            {stats.averagePronunciationScore ?? '—'}
            {stats.averagePronunciationScore != null && <span className="text-sm font-normal text-stone-400">/100</span>}
          </dd>
        </div>
        <div className="p-4 space-y-1">
          <dt className="text-xs text-stone-500">{t('analytics.oralSessions')}</dt>
          <dd className="text-2xl font-french-serif font-semibold text-stone-900">{stats.shadowingSessionsCompleted ?? 0}</dd>
          <dd className="text-[11px] text-stone-500">{stats.sentencesAnalyzed ?? 0} {t('analytics.sentencesAnalyzed')}</dd>
        </div>
        <div className="p-4 space-y-1">
          <dt className="text-xs text-stone-500">{t('analytics.streakDays')}</dt>
          <dd className="text-2xl font-french-serif font-semibold text-stone-900">
            {stats.streak ?? 0}
            <span className="text-sm font-normal text-stone-400"> {t('analytics.days')}</span>
          </dd>
        </div>
      </dl>

      {/* Main Grid: Phoneme Radar & Recent Voice History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Phoneme Mastery Checklist */}
        <div className="lg:col-span-2 p-6 rounded-xl bg-white border border-stone-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-french-serif font-bold text-lg text-stone-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-600" />
                <span>{isEn ? 'Phonetic Profile & Diagnostic' : '核心法语音素发音画像 (Diagnostic Phonétique)'}</span>
              </h3>
              <p className="text-xs text-stone-500">
                {isEn ? 'Continuous monitoring and feedback on essential French phonemes' : '针对核心偏误音素进行持续监测与矫正建议'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {phonemeChecklist.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/60 hover:bg-white hover:border-amber-300 transition-all space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-stone-900 bg-white px-2 py-0.5 rounded-md border border-stone-200 shadow-2xs">
                      {item.phoneme}
                    </span>
                    <span className="text-xs font-semibold text-stone-700">
                      {item.name}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      item.status === 'mastered'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.status === 'good'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {item.status === 'mastered'
                      ? (isEn ? 'Mastered' : '已熟练')
                      : item.status === 'good'
                      ? (isEn ? 'Good' : '良好')
                      : (isEn ? 'Focus' : '需注意')}
                  </span>
                </div>

                <div className="text-[11px] text-stone-500">
                  {isEn ? 'Examples:' : '典型词:'} <span className="font-medium text-stone-700">{item.examples}</span>
                </div>

                <p className="text-xs text-stone-600 font-french-sans leading-relaxed pt-1 border-t border-stone-200/60">
                  {item.tip}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right 1 Col: AI Coach Overall Diagnosis */}
        <div className="p-6 rounded-xl bg-stone-900 text-white flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-french-serif font-bold text-lg text-stone-100">
                  {isEn ? 'AI Coach Synthesis' : '法语AI教练综合诊断'}
                </h4>
                <p className="text-xs text-stone-400">{isEn ? 'Professeur Pierre\'s feedback' : 'Professeur Pierre 的学习寄语'}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white/10 border border-white/15 space-y-2 text-xs">
              <div className="font-bold text-amber-300">
                {isEn ? 'Key Strengths (Points Forts):' : '显著优势 (Points Forts):'}
              </div>
              <ul className="list-disc list-inside space-y-1 text-stone-300">
                <li>{isEn ? 'High syntax reconstruction accuracy; strong grasp of subjunctive triggers.' : '长难句的主干意群重组准确度极高，对虚拟式触发词敏感度好'}</li>
                <li>{isEn ? 'Smooth intonation contour with natural final-syllable descent.' : '整体语调平稳自然，具有标准的法语陈述句句末微降调'}</li>
              </ul>
            </div>

            <div className="p-3.5 rounded-xl bg-white/10 border border-white/15 space-y-2 text-xs">
              <div className="font-bold text-rose-300">
                🎯 {isEn ? 'Next Milestone (Objectifs):' : '优先进阶目标 (Objectifs):'}
              </div>
              <ul className="list-disc list-inside space-y-1 text-stone-300">
                <li>{isEn ? 'Reinforce rounded front vowel [y]: purse lips tight into a small circle.' : '强化圆唇前元音 [y]：录音时保持嘴唇收束成小孔，避免混淆'}</li>
                <li>{isEn ? 'Moderate aspiration on p/t/k before vowels for authentic French phonetics.' : '注意 p/t/k 在元音前不要过度送气，体会法语的清不送气特点'}</li>
              </ul>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 italic font-french-serif">
            « Petit à petit, l'oiseau fait son nid. »
          </div>
        </div>
      </div>

      {/* Recent Pronunciation Assessments History */}
      {stats.pronunciationHistory && stats.pronunciationHistory.length > 0 && (
        <div className="p-6 rounded-xl bg-white border border-stone-200 shadow-xs space-y-4">
          <h3 className="font-french-serif font-bold text-lg text-stone-900">
            {t('analytics.scoreHistory')}
          </h3>
          <div className="space-y-2.5">
            {stats.pronunciationHistory.slice(-5).reverse().map((rec, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between gap-3"
              >
                <div className="space-y-0.5 flex-1">
                  <p className="font-french-serif text-sm font-semibold text-stone-800">
                    « {rec.text} »
                  </p>
                  <span className="text-[11px] text-stone-400">{rec.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-french-serif text-lg font-bold text-amber-700">
                    {rec.score} / 100
                  </span>
                  <button
                    onClick={() => speakFrench(rec.text)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-amber-800 hover:bg-stone-200 cursor-pointer"
                    title={t('reader.playSentence')}
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

