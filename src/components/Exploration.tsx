import { useEffect, useRef, useState } from 'react';
import { Award, BookOpen, Check, CheckCircle2, Clock3, Compass, Eye, Feather, Footprints, Leaf, LoaderCircle, MapPin, Pause, Play, RotateCcw, Sparkles, Sprout, Timer, Trees, Trophy, Wind, X } from 'lucide-react';
import { environments, missions, observationPrompts, type NatureMission } from '../data/missions';
import type { JournalEntry, MissionCompletion, WalkRecord } from '../lib/db';
import { calculateAchievements, calculateCurrentStreak, calculateWeeklyRecap, getDailyMissions, localDateKey } from '../lib/gamification';
import { remainingAtDeadline, resumeDeadline } from '../lib/walkTimer';

type Screen = 'home' | 'identify' | 'quests' | 'journal' | 'settings' | 'missions' | 'passport' | 'walk' | 'wrapped';

type ObserveCallback = (text: string, category: string, environment?: string) => Promise<void>;

export function MissionScreen({ completions, busyId, onComplete }: { completions: MissionCompletion[]; busyId: string; onComplete: (mission: NatureMission, observation: string) => void }) {
  const [activeId, setActiveId] = useState('');
  const [observation, setObservation] = useState('');
  const today = localDateKey(new Date());
  const todaysCompletions = new Set(completions.filter((record) => record.localDate === today).map((record) => record.missionId));
  const featuredIds = new Set(getDailyMissions().map((mission) => mission.id));

  return <section className="missions-screen">
    <div className="mission-welcome panel">
      <div className="mission-welcome-icon"><Leaf size={23} /></div>
      <div><span className="card-kicker">TOUCH GRASS MODE</span><h2>Small missions, real fresh air.</h2><p>Pick one thing to notice outside. No model, signal, GPS, or special equipment required.</p></div>
      <span className="mission-xp"><Sparkles size={15} /> {completions.reduce((sum, item) => sum + item.xp, 0)} XP</span>
    </div>
    <div className="daily-mission-label"><span className="card-kicker">TODAY’S INVITATIONS</span><span>{getDailyMissions().length} gentle ways to begin</span></div>
    <div className="mission-grid">
      {missions.map((mission, index) => {
        const active = activeId === mission.id;
        const done = todaysCompletions.has(mission.id);
        const daily = featuredIds.has(mission.id);
        const busy = busyId === mission.id;
        return <article className={`mission-card panel ${done ? 'mission-done' : ''} ${daily ? 'mission-featured' : ''}`} key={mission.id}>
          <div className="mission-card-top"><span className="mission-index">{String(index + 1).padStart(2, '0')}</span><span className="mission-category">{mission.category}{daily ? ' · TODAY' : ''}</span><span className="duration-pill"><Clock3 size={12} /> {mission.durationMinutes} min</span></div>
          <h2>{mission.title}</h2><p className="mission-description">{mission.description}</p>
          <div className="mission-meta"><span>{mission.difficulty}</span><span>+10 XP</span></div>
          <details className="mission-details"><summary>See the simple steps</summary><ol>{mission.instructions.map((step) => <li key={step}>{step}</li>)}</ol></details>
          {done ? <div className="mission-completed-label"><CheckCircle2 size={17} /> Nicely noticed today</div> : active ? <div className="mission-active">
            <div className="look-closer-prompt"><Eye size={16} /><span>{mission.prompt}</span></div>
            <label htmlFor={`mission-observation-${mission.id}`}>Optional field note</label>
            <textarea id={`mission-observation-${mission.id}`} rows={2} maxLength={500} placeholder="Anything you’d like to remember…" value={observation} onChange={(event) => setObservation(event.target.value)} />
            <div className="mission-actions"><button className="text-button" onClick={() => { setActiveId(''); setObservation(''); }}>Not now</button><button className="button button-small button-primary" disabled={busy} onClick={() => onComplete(mission, observation.trim())}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{busy ? 'Saving…' : 'Mark complete'}</button></div>
          </div> : <button className="button button-small button-secondary mission-start" onClick={() => { setActiveId(mission.id); setObservation(''); }}><Play size={14} /> Start mission</button>}
        </article>;
      })}
    </div>
    <p className="mission-note"><CheckCircle2 size={15} /> These are invitations, not a checklist. Stay on safe paths and leave living things where you find them.</p>
  </section>;
}

function BadgeSymbol({ name }: { name: string }) {
  if (name === 'seedling') return <Sprout size={18} />;
  if (name === 'compass') return <Compass size={18} />;
  if (name === 'eye') return <Eye size={18} />;
  if (name === 'autumn') return <Feather size={18} />;
  return <Leaf size={18} />;
}

export function NaturePassportScreen({ entries, completions, walks, totalXp, onSaveObservation }: { entries: JournalEntry[]; completions: MissionCompletion[]; walks: WalkRecord[]; totalXp: number; onSaveObservation: ObserveCallback }) {
  const [observation, setObservation] = useState('');
  const [category, setCategory] = useState('Plants');
  const [environment, setEnvironment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const achievements = calculateAchievements(completions, entries);
  const streak = calculateCurrentStreak(completions, walks);
  const discoveries = entries.filter((entry) => entry.kind !== 'observation' && entry.kind !== 'walk');
  const categories = [...new Set([
    ...completions.map((item) => item.category),
    ...entries.map((entry) => entry.category).filter((item): item is string => Boolean(item)),
  ])].sort();
  const recordedEnvironments = new Set(entries.map((entry) => entry.environment).filter((item): item is string => Boolean(item)));
  const timeline = [
    ...entries.map((entry) => ({ id: entry.id, date: entry.createdAt, title: entry.label, detail: entry.kind === 'observation' ? 'A field observation' : entry.kind === 'walk' ? 'A walk reflection' : 'Saved image-classifier prediction', kind: entry.kind ?? 'discovery' })),
    ...completions.map((item) => ({ id: `mission:${item.id}`, date: item.completedAt, title: item.title, detail: `Mission · ${item.xp} XP`, kind: 'mission' })),
    ...walks.map((item) => ({ id: `walk:${item.id}`, date: item.completedAt, title: `${item.durationMinutes}-minute Digital Detox Walk`, detail: `Walk completed · ${item.xp} XP`, kind: 'walk' })),
  ].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 12);

  const save = async () => {
    if (!observation.trim() || saving) return;
    setSaving(true);
    try {
      await onSaveObservation(observation.trim(), category, environment || undefined);
      setObservation('');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2400);
    } finally { setSaving(false); }
  };

  return <section className="passport-screen">
    <div className="passport-cover panel"><div className="passport-cover-copy"><span className="card-kicker">YOUR NATURE PASSPORT</span><h2>A record of what you noticed.</h2><p>Every number and moment here comes from something you saved or completed on this device.</p></div><div className="passport-cover-art"><Trees size={58} strokeWidth={1.1} /><span>LOCAL<br />FIELD NOTES</span></div><div className="passport-stats"><div><strong>{discoveries.length}</strong><span>saved discoveries</span></div><div><strong>{completions.length}</strong><span>missions completed</span></div><div><strong>{streak}</strong><span>day streak</span></div><div><strong>{totalXp}</strong><span>earned XP</span></div></div></div>
    <div className="passport-columns">
      <section className="passport-section panel"><div className="section-heading"><div><span className="card-kicker">YOUR MILESTONES</span><h2>Badges earned along the way</h2></div><Trophy size={20} /></div><div className="badge-grid">{achievements.map((badge) => <article className={`achievement-badge ${badge.unlocked ? 'badge-unlocked' : ''}`} key={badge.id}><span className="badge-icon" aria-hidden="true">{badge.unlocked ? <BadgeSymbol name={badge.icon} /> : <span>·</span>}</span><div><strong>{badge.title}</strong><p>{badge.description}</p>{badge.unlocked ? <span className="badge-earned"><Check size={12} /> Earned</span> : <div className="badge-progress"><span>{badge.progress}/{badge.target}</span><div className="quest-meter"><span style={{ width: `${(badge.progress / badge.target) * 100}%` }} /></div></div>}</div></article>)}</div></section>
      <section className="passport-section panel"><div className="section-heading"><div><span className="card-kicker">PLACES YOU’VE RECORDED</span><h2>Environments, by your notes</h2></div><MapPin size={19} /></div><p className="passport-help">These are places you chose to write down—not GPS visits.</p><div className="environment-grid">{environments.map((place) => <div className={`environment-tile ${recordedEnvironments.has(place) ? 'environment-recorded' : ''}`} key={place}><span aria-hidden="true">{place === 'Garden' ? '☘' : place === 'Park' ? '⌁' : place === 'Forest' ? '♧' : place === 'Lakeside' ? '≈' : '△'}</span><strong>{place}</strong><small>{recordedEnvironments.has(place) ? 'In your notes' : 'Not recorded yet'}</small></div>)}</div>{categories.length > 0 ? <div className="category-list"><span>Categories from completed missions and saved notes</span><div>{categories.map((item) => <span className="category-chip" key={item}>{item}</span>)}</div></div> : <div className="passport-inline-empty"><Leaf size={16} /> Complete a mission or save a field note to begin exploring categories.</div>}</section>
    </div>
    <div className="passport-columns passport-bottom">
      <section className="passport-section panel look-closer-card"><div className="section-heading"><div><span className="card-kicker">LOOK CLOSER</span><h2>Save a little observation</h2></div><Eye size={19} /></div><p className="passport-help">A beginner’s note is enough. It doesn’t need to be a scientific conclusion.</p><div className="look-prompt-cloud">{observationPrompts.map((prompt) => <button className="look-prompt-chip" key={prompt} onClick={() => setObservation((current) => current ? `${current}\n${prompt} ` : `${prompt} `)}>{prompt}</button>)}</div><label htmlFor="passport-observation">What caught your attention?</label><textarea id="passport-observation" rows={3} maxLength={1000} value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="A shape, sound, colour, or small change…"/><div className="observation-fields"><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{['Plants', 'Animals', 'Sky', 'Sound', 'Textures', 'Patterns', 'Small life', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></label><label>Environment (optional)<select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="">Not specified</option>{environments.map((item) => <option key={item}>{item}</option>)}</select></label></div><button className="button button-primary" disabled={!observation.trim() || saving} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={16} /> : <BookOpen size={16} />}{saved ? 'Saved to your journal' : 'Save observation'}</button></section>
      <section className="passport-section panel timeline-card"><div className="section-heading"><div><span className="card-kicker">YOUR FIELD NOTES</span><h2>A little timeline</h2></div><Feather size={19} /></div>{timeline.length === 0 ? <div className="passport-empty"><div><Compass size={24} /></div><strong>Your story starts with noticing.</strong><p>Complete a mission, save an observation, or keep a discovery to see it here.</p></div> : <ol className="passport-timeline">{timeline.map((item) => <li key={item.id}><span className={`timeline-dot timeline-${item.kind}`} /><div><time dateTime={item.date}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.date))}</time><strong>{item.title}</strong><small>{item.detail}</small></div></li>)}</ol>}</section>
    </div>
  </section>;
}

export function WeeklyRecapScreen({ entries, completions, walks, onNavigate }: { entries: JournalEntry[]; completions: MissionCompletion[]; walks: WalkRecord[]; onNavigate: (screen: Screen) => void }) {
  const recap = calculateWeeklyRecap(completions, entries, walks);
  const lastDay = new Date(recap.end.getFullYear(), recap.end.getMonth(), recap.end.getDate() - 1);
  const rangeLabel = `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(recap.start)} – ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(lastDay)}`;
  const active = recap.missionsCompleted + recap.discoveriesSaved + recap.observationsRecorded + recap.walkMinutes > 0;
  return <section className="wrapped-screen"><article className="wrapped-cover panel"><span className="wrapped-overline"><span /> THIS WEEK IN YOUR WILD WORLD</span><p className="wrapped-range">{rangeLabel}</p><h2>{active ? 'A week, seen a little closer.' : 'A fresh page for this week.'}</h2><p className="wrapped-lede">{active ? 'A few real moments you chose to keep. Nothing more, nothing less.' : 'No saved activity for this week yet. There’s still time for one small noticing.'}</p><div className="wrapped-stats"><div><Sparkles size={18} /><strong>{recap.missionsCompleted}</strong><span>missions complete</span></div><div><Leaf size={18} /><strong>{recap.discoveriesSaved}</strong><span>discoveries saved</span></div><div><Eye size={18} /><strong>{recap.observationsRecorded}</strong><span>observations noted</span></div><div><Footprints size={18} /><strong>{recap.walkMinutes}<small> min</small></strong><span>completed walks</span></div></div><div className="wrapped-decoration" aria-hidden="true"><span /><span /><span /><span /><span /></div></article>
    <div className="wrapped-lower"><section className="wrapped-favorite panel"><span className="card-kicker">A DETAIL TO REMEMBER</span>{recap.favoriteDiscovery ? <><h3>{recap.favoriteDiscovery}</h3><p>Your most frequently saved prediction this week. It’s a model suggestion, not a verified identification.</p></> : <><h3>One moment is enough.</h3><p>Save a couple of discoveries in a week and your most revisited label can show up here.</p></>}<div className="wrapped-favorite-mark"><Leaf size={22} /></div></section><section className="wrapped-next panel"><span className="card-kicker">A GENTLE NEXT STEP</span><span className="quest-category">{recap.suggestedMission.category} · {recap.suggestedMission.durationMinutes} MIN</span><h3>{recap.suggestedMission.title}</h3><p>{recap.suggestedMission.description}</p><button className="text-button arrow-link" onClick={() => onNavigate('missions')}>Explore missions <span aria-hidden="true">→</span></button></section></div>
    <div className="wrapped-footer"><span>Made of your local field notes, not guesses.</span><button className="button button-secondary" onClick={() => onNavigate('passport')}><Compass size={15} /> Open Nature Passport</button></div>
  </section>;
}

export function DigitalDetoxWalk({ onComplete, onSaveReflection }: { onComplete: (record: WalkRecord) => Promise<boolean>; onSaveReflection: (reflection: string) => Promise<void> }) {
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [phase, setPhase] = useState<'intro' | 'active' | 'paused' | 'finished' | 'ended'>('intro');
  const [remainingMs, setRemainingMs] = useState(durationMinutes * 60_000);
  const [reflection, setReflection] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [rewardSaved, setRewardSaved] = useState(false);
  const deadline = useRef(0);
  const remainingRef = useRef(remainingMs);
  const startedAt = useRef(0);
  const completionSaved = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const active = phase === 'active';
  onCompleteRef.current = onComplete;
  const durationRef = useRef(durationMinutes);
  durationRef.current = durationMinutes;

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const remaining = remainingAtDeadline(deadline.current, Date.now());
      remainingRef.current = remaining;
      setRemainingMs(remaining);
      if (remaining === 0 && !completionSaved.current) {
        completionSaved.current = true;
        setPhase('finished');
        const completedAt = new Date().toISOString();
        const record: WalkRecord = {
          id: globalThis.crypto?.randomUUID?.() ?? `walk-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          startedAt: startedAt.current,
          completedAt,
          localDate: localDateKey(new Date()),
          durationMinutes: durationRef.current,
          elapsedSeconds: durationRef.current * 60,
          completed: true,
          xp: 15,
        };
        void onCompleteRef.current(record).then((saved) => {
          if (saved) setRewardSaved(true);
          else setSaveStatus('Walk finished, but its reward could not be confirmed.');
        }).catch(() => setSaveStatus('Walk finished, but its reward could not be saved. Check local storage and try again.'));
      }
    };
    tick();
    const timerId = window.setInterval(tick, 250);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(timerId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [active]);

  const start = () => {
    const total = durationMinutes * 60_000;
    remainingRef.current = total;
    setRemainingMs(total);
    startedAt.current = Date.now();
    completionSaved.current = false;
    setRewardSaved(false);
    setReflection('');
    setSaveStatus('');
    deadline.current = Date.now() + total;
    setPhase('active');
  };
  const pause = () => {
    const remaining = remainingAtDeadline(deadline.current, Date.now());
    remainingRef.current = remaining;
    setRemainingMs(remaining);
    setPhase('paused');
  };
  const resume = () => {
    deadline.current = resumeDeadline(Date.now(), remainingRef.current);
    setPhase('active');
  };
  const endEarly = () => {
    if (!window.confirm('End this walk early? It will not count as a completed walk or earn XP.')) return;
    setPhase('ended');
  };
  const selectDuration = (minutes: number) => {
    setDurationMinutes(minutes);
    setRemainingMs(minutes * 60_000);
    remainingRef.current = minutes * 60_000;
  };
  const saveReflection = async () => {
    if (!reflection.trim()) return;
    try {
      await onSaveReflection(reflection.trim());
      setSaveStatus('Reflection saved in your Field Journal.');
    } catch {
      setSaveStatus('The reflection could not be saved. Please try again.');
    }
  };
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  const elapsedPercent = phase === 'finished' ? 100 : Math.min(100, Math.max(0, ((durationMinutes * 60_000 - remainingMs) / (durationMinutes * 60_000)) * 100));

  return <section className="walk-screen"><div className="walk-intro panel"><div className="walk-icon"><Wind size={25} /></div><span className="card-kicker">DIGITAL DETOX WALK</span><h2>Let the path have your attention.</h2><p>Choose a gentle timer, put your phone somewhere safe, and let the outdoors set the pace. Keep your awareness on the route and surroundings.</p><div className="walk-safety"><CheckCircle2 size={16} /> Choose a safe route. Stay alert to traffic, weather, and other people.</div></div>
    <div className={`walk-session panel walk-${phase}`}>
      {phase === 'intro' && <><div className="session-topline"><span className="card-kicker">YOUR WALK, YOUR PACE</span><Timer size={19} /></div><h3>How long feels right?</h3><div className="duration-options">{[5, 10, 20].map((option) => <button className={durationMinutes === option ? 'duration-selected' : ''} key={option} onClick={() => selectDuration(option)}><strong>{option}</strong><span>minutes</span></button>)}</div><p className="walk-prompt">When you’re ready, set your screen aside. You don’t need to check in while you walk.</p><button className="button button-primary walk-main-action" onClick={start}><Play size={16} /> Begin {durationMinutes}-minute walk</button></>}
      {(phase === 'active' || phase === 'paused') && <><div className="walk-timer-face"><span className="card-kicker">{phase === 'paused' ? 'PAUSED · TAKE YOUR TIME' : 'YOUR QUIET MINUTES'}</span><strong aria-live="polite">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</strong><div className="walk-meter"><span style={{ width: `${elapsedPercent}%` }} /></div></div><div className="walk-prompt-list"><p><Eye size={15} /> {observationPrompts[Math.floor((durationMinutes * 60 - remainingMs / 1000) / 60) % observationPrompts.length]}</p><p><Leaf size={15} /> Look up now and then—without stopping in an unsafe place.</p></div><div className="walk-controls">{phase === 'active' ? <button className="button button-secondary" onClick={pause}><Pause size={15} /> Pause</button> : <button className="button button-primary" onClick={resume}><Play size={15} /> Resume</button>}<button className="text-button walk-end" onClick={endEarly}><X size={15} /> End early</button></div></>}
      {(phase === 'finished' || phase === 'ended') && <><div className="walk-finished-icon">{phase === 'finished' ? <CheckCircle2 size={28} /> : <RotateCcw size={25} />}</div><span className="card-kicker">{phase === 'finished' ? 'WALK COMPLETE' : 'WALK ENDED EARLY'}</span><h3>{phase === 'finished' ? 'You made room to notice.' : 'The path will be there another time.'}</h3>{phase === 'finished' && rewardSaved && <p className="walk-reward"><Sparkles size={16} /> +15 XP added to your local passport</p>}{phase === 'finished' && !rewardSaved && !saveStatus && <p className="walk-save-status" role="status">Saving your completed walk locally…</p>}{phase === 'ended' && <p className="walk-save-status">This walk ended early; no completion reward was recorded.</p>}{saveStatus && <p className="walk-save-status" role="status">{saveStatus}</p>}<label htmlFor="walk-reflection">Optional reflection</label><textarea id="walk-reflection" rows={3} maxLength={1000} value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="What stayed with you from the walk?"/><div className="walk-controls"><button className="button button-primary" disabled={!reflection.trim()} onClick={() => void saveReflection()}><BookOpen size={15} /> Save reflection</button><button className="button button-secondary" onClick={() => setPhase('intro')}><RotateCcw size={15} /> New walk</button></div></>}
    </div><div className="walk-side-note"><Feather size={16} /><p>During the walk, let your ears, eyes, and sense of space do the work. You can write when you return.</p></div>
  </section>;
}

export function PassportSummary({ entries, completions, walks, xp, onNavigate }: { entries: JournalEntry[]; completions: MissionCompletion[]; walks: WalkRecord[]; xp: number; onNavigate: (screen: Screen) => void }) {
  const latest = [...completions].sort((left, right) => right.completedAt.localeCompare(left.completedAt))[0];
  const badges = calculateAchievements(completions, entries).filter((badge) => badge.unlocked).slice(-3);
  return <section className="panel home-passport-card"><div><span className="card-kicker">YOUR NATURE PASSPORT</span><h2>{xp} XP <span>·</span> {calculateCurrentStreak(completions, walks)} day streak</h2><p>{entries.length} saved moments · {completions.length} missions</p>{latest && <small>Last mission: {latest.title}</small>}</div><div className="passport-home-badges">{badges.map((badge) => <span key={badge.id} title={badge.title}><BadgeSymbol name={badge.icon} /></span>)}</div><button className="text-button arrow-link" onClick={() => onNavigate('passport')}>Open passport <span aria-hidden="true">→</span></button></section>;
}

export function WeeklyRecapLink({ onOpen }: { onOpen: () => void }) {
  return <button className="secondary-explore-link" onClick={onOpen}><Award size={18} /><span><strong>Your Nature Wrapped</strong><small>A local recap of this week</small></span><span aria-hidden="true">→</span></button>;
}
