import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, BookOpen, Camera, Check, CheckCircle2, ChevronRight,
  CircleHelp, Cloud, Compass, Eye, Feather, Flower2, ImagePlus, Leaf, LoaderCircle,
  Menu, Mountain, RotateCcw, Settings as SettingsIcon, ShieldCheck, Sparkles, Award,
  Sprout, Trash2, Wifi, WifiOff, X, Footprints,
} from 'lucide-react';
import { countCompletedQuestIds, getQuestOfTheDay, quests, type NatureQuest } from './data/quests';
import { clearAllLocalData, completeMission as persistMissionCompletion, deleteJournalEntry, getCompletedWalks, getCompletedQuestIds, getJournalEntries, getMissionCompletions, saveCompletedWalk, saveJournalEntry, setQuestCompleted, type JournalEntry, type MissionCompletion, type WalkRecord } from './lib/db';
import { classifyImage, getModelState, type ModelProgress, type ModelState, type Prediction } from './lib/classifier';
import { environments, observationPrompts, type NatureMission } from './data/missions';
import { DigitalDetoxWalk, MissionScreen, NaturePassportScreen, PassportSummary, WeeklyRecapLink, WeeklyRecapScreen } from './components/Exploration';
import { getDailyMissions, localDateKey, MISSION_XP } from './lib/gamification';

type Screen = 'home' | 'identify' | 'quests' | 'journal' | 'settings' | 'missions' | 'passport' | 'walk' | 'wrapped';
type IdentifyState = 'empty' | 'selected' | 'loading' | 'error' | 'complete';
type NavItem = { id: Screen; label: string; Icon: typeof Leaf };

const navigation: NavItem[] = [
  { id: 'home', label: 'Home', Icon: Compass },
  { id: 'identify', label: 'Identify', Icon: Camera },
  { id: 'quests', label: 'Quests', Icon: Sparkles },
  { id: 'journal', label: 'Journal', Icon: BookOpen },
];

const friendlyError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : '';
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'You appear to be offline. If this is the first identification on this device, connect once to download the model, then try again.';
  }
  if (/memory|allocation|wasm|out of/i.test(message)) return 'This device could not make enough memory available for the model. Close other tabs or try a smaller image.';
  if (/browser cannot|OffscreenCanvas|createImageBitmap|prepare the selected photo/i.test(message)) return message;
  if (/fetch|network|download|load|failed/i.test(message)) return 'The model could not be downloaded or loaded. Check your connection and try again. Your photo stays on this device.';
  return message || 'Something went wrong while identifying this image. Please try again.';
};

function ImageThumbnail({ image, alt }: { image?: Blob; alt: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!image) return;
    const objectUrl = URL.createObjectURL(image);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);
  return image && url ? <img className="journal-thumb" src={url} alt={alt} /> : <div className="journal-thumb image-placeholder" aria-label="No saved image"><Leaf size={21} /></div>;
}

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [missionCompletions, setMissionCompletions] = useState<MissionCompletion[]>([]);
  const [walkRecords, setWalkRecords] = useState<WalkRecord[]>([]);
  const [storageError, setStorageError] = useState('');
  const [notice, setNotice] = useState('');
  const [modelState, setModelState] = useState<ModelState>(getModelState());
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine);
  const [file, setFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState('');
  const [identifyState, setIdentifyState] = useState<IdentifyState>('empty');
  const [identifyError, setIdentifyError] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [progress, setProgress] = useState<ModelProgress>();
  const [savedResult, setSavedResult] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [busyQuestId, setBusyQuestId] = useState('');
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingEntryId, setSavingEntryId] = useState('');
  const [busyMissionId, setBusyMissionId] = useState('');
  const [selectedEnvironment, setSelectedEnvironment] = useState('');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const identifyRequestId = useRef(0);

  useEffect(() => {
    let mounted = true;
    void Promise.all([getJournalEntries(), getCompletedQuestIds(), getMissionCompletions(), getCompletedWalks()])
      .then(([journal, completed, completedMissions, walks]) => {
        if (!mounted) return;
        setEntries(journal);
        setCompletedIds(completed);
        setMissionCompletions(completedMissions);
        setWalkRecords(walks);
        setEditingNotes(Object.fromEntries(journal.map((entry) => [entry.id, entry.notes])));
      })
      .catch((error: unknown) => {
        if (mounted) setStorageError(error instanceof Error ? error.message : 'Local storage is unavailable.');
      });
    const setOnlineStatus = () => setOnline(navigator.onLine);
    window.addEventListener('online', setOnlineStatus);
    window.addEventListener('offline', setOnlineStatus);
    const refreshModelState = () => setModelState(getModelState());
    const interval = window.setInterval(refreshModelState, 1000);
    return () => {
      mounted = false;
      window.removeEventListener('online', setOnlineStatus);
      window.removeEventListener('offline', setOnlineStatus);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const questOfDay = useMemo(() => getQuestOfTheDay(), []);
  const featuredMission = useMemo(() => getDailyMissions()[0]!, []);
  const completedCount = countCompletedQuestIds(completedIds);
  const navigate = (next: Screen) => {
    setScreen(next);
    setMobileMenuOpen(false);
    setMoreMenuOpen(false);
    setNotice('');
  };

  const chooseImage = (candidate?: File) => {
    if (!candidate) return;
    identifyRequestId.current += 1;
    if (!candidate.type.startsWith('image/')) {
      setFile(undefined);
      setPredictions([]);
      setIdentifyError('Choose an image file supported by your browser, such as a JPEG, PNG, or WebP photo.');
      setIdentifyState('error');
      return;
    }
    if (candidate.size > 12 * 1024 * 1024) {
      setFile(undefined);
      setPredictions([]);
      setIdentifyError('This image is larger than 12 MB. Choose a smaller image to protect this device’s memory.');
      setIdentifyState('error');
      return;
    }
    setFile(candidate);
    setSelectedEnvironment('');
    setPredictions([]);
    setProgress(undefined);
    setIdentifyError('');
    setSavedResult(false);
    setIdentifyState('selected');
  };

  const identify = async () => {
    if (!file || !previewUrl) return;
    const requestId = ++identifyRequestId.current;
    const selectedFile = file;
    setIdentifyState('loading');
    setIdentifyError('');
    setProgress(undefined);
    try {
      const result = await classifyImage(selectedFile, (nextProgress) => {
        if (requestId !== identifyRequestId.current) return;
        setProgress(nextProgress);
        if (nextProgress.status === 'inference') setModelState('ready');
        else if (nextProgress.status !== 'ready') setModelState('loading');
      });
      if (requestId !== identifyRequestId.current) return;
      setPredictions(result);
      setModelState(getModelState());
      setIdentifyState('complete');
    } catch (error) {
      if (requestId !== identifyRequestId.current) return;
      setModelState(getModelState());
      setIdentifyError(friendlyError(error));
      setIdentifyState('error');
    }
  };

  const saveDiscovery = async () => {
    const top = predictions[0];
    if (!file || !top || savedResult) return;
    const entry: JournalEntry = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: top.label,
      createdAt: new Date().toISOString(),
      notes: '',
      image: file,
      kind: 'discovery',
      category: 'Classifier prediction',
      ...(selectedEnvironment ? { environment: selectedEnvironment } : {}),
    };
    try {
      await saveJournalEntry(entry);
      setEntries((current) => [entry, ...current]);
      setEditingNotes((current) => ({ ...current, [entry.id]: '' }));
      setSavedResult(true);
      setSelectedEnvironment('');
      setNotice('Discovery saved to your private field journal on this device.');
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Could not save this discovery locally.');
    }
  };

  const completeNatureMission = async (mission: NatureMission, observation: string) => {
    const now = new Date();
    const record: MissionCompletion = {
      id: `${localDateKey(now)}:${mission.id}`,
      missionId: mission.id,
      title: mission.title,
      completedAt: now.toISOString(),
      localDate: localDateKey(now),
      xp: MISSION_XP,
      category: mission.category,
      ...(observation ? { observation } : {}),
    };
    setBusyMissionId(mission.id);
    try {
      const saved = await persistMissionCompletion(record);
      if (!saved) return;
      setMissionCompletions((current) => [...current, record]);
      setNotice(`Mission complete. +${MISSION_XP} XP earned${observation ? ' and your observation was saved in the journal' : ''}.`);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Your mission could not be saved locally.');
    } finally {
      setBusyMissionId('');
    }
  };

  const recordObservation = async (text: string, category: string, environment?: string) => {
    const entry: JournalEntry = {
      id: globalThis.crypto?.randomUUID?.() ?? `observation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: `Observation · ${category}`,
      createdAt: new Date().toISOString(),
      notes: text,
      kind: 'observation',
      category,
      ...(environment ? { environment } : {}),
    };
    await saveJournalEntry(entry);
    setEntries((current) => [entry, ...current]);
    setEditingNotes((current) => ({ ...current, [entry.id]: text }));
    setNotice('Your observation was saved in the private Field Journal.');
  };

  const saveWalk = async (record: WalkRecord): Promise<boolean> => {
    const saved = await saveCompletedWalk(record);
    if (!saved) return false;
    setWalkRecords((current) => [...current, record]);
    setNotice(`Walk complete. +${record.xp} XP earned on your Nature Passport.`);
    return true;
  };

  const saveWalkReflection = async (reflection: string) => {
    const entry: JournalEntry = {
      id: globalThis.crypto?.randomUUID?.() ?? `walk-note-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: 'Digital Detox Walk reflection',
      createdAt: new Date().toISOString(),
      notes: reflection,
      kind: 'walk',
      category: 'Walking',
    };
    await saveJournalEntry(entry);
    setEntries((current) => [entry, ...current]);
    setEditingNotes((current) => ({ ...current, [entry.id]: reflection }));
  };

  const updateEnvironment = async (entry: JournalEntry, environment: string) => {
    const updated: JournalEntry = { ...entry };
    if (environment) updated.environment = environment;
    else delete updated.environment;
    try {
      await saveJournalEntry(updated);
      setEntries((current) => current.map((item) => item.id === entry.id ? updated : item));
      setNotice('Environment note saved on this device.');
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'The environment note could not be saved.');
    }
  };

  const completeQuest = async (quest: NatureQuest) => {
    if (completedIds.includes(quest.id)) return;
    setBusyQuestId(quest.id);
    try {
      await setQuestCompleted(quest.id);
      setCompletedIds((current) => [...current, quest.id]);
      setNotice(`Lovely noticing. “${quest.title}” is complete.`);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Quest progress could not be saved.');
    } finally {
      setBusyQuestId('');
    }
  };

  const removeEntry = async (entry: JournalEntry) => {
    if (!window.confirm(`Delete “${entry.label}” from this device? This cannot be undone.`)) return;
    try {
      await deleteJournalEntry(entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setNotice('The journal entry was deleted from this device.');
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Could not delete this journal entry.');
    }
  };

  const persistNotes = async (entry: JournalEntry) => {
    setSavingEntryId(entry.id);
    try {
      const updated = { ...entry, notes: editingNotes[entry.id] ?? '' };
      await saveJournalEntry(updated);
      setEntries((current) => current.map((item) => item.id === entry.id ? updated : item));
      setNotice('Your journal note is saved on this device.');
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Your note could not be saved.');
    } finally {
      setSavingEntryId('');
    }
  };

  const clearData = async () => {
    if (!window.confirm('Permanently clear all journal entries and quest progress stored by WildSense on this device? This cannot be undone.')) return;
    try {
      await clearAllLocalData();
      setEntries([]);
      setCompletedIds([]);
      setMissionCompletions([]);
      setWalkRecords([]);
      setEditingNotes({});
      setStorageError('');
      setNotice('Your local journal and quest progress have been cleared.');
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Could not clear local data.');
    }
  };

  const screenTitle: Record<Screen, string> = { home: 'A little more wonder, every day.', identify: 'Identify a discovery', quests: 'Small ways to notice more', journal: 'Your field journal', settings: 'A little about your data', missions: 'Touch Grass Mode', passport: 'Your Nature Passport', walk: 'A Digital Detox Walk', wrapped: 'Nature Wrapped' };
  const totalXp = missionCompletions.reduce((total, item) => total + item.xp, 0) + walkRecords.reduce((total, item) => total + item.xp, 0);
  const progressPercent = typeof progress?.progress === 'number' && Number.isFinite(progress.progress) ? Math.min(100, Math.max(0, Math.round(progress.progress))) : undefined;
  const progressMessage = progress?.status === 'inference'
    ? 'Reading the image on this device…'
    : progress?.status === 'progress'
      ? `Downloading ${progress.file?.split('/').at(-1) ?? 'model file'}${progressPercent !== undefined ? ` · ${progressPercent}%` : ''}`
      : progress?.status === 'download'
        ? 'Downloading the image model to this device…'
        : progress?.status === 'initiate'
          ? 'Preparing the model download…'
          : 'Preparing the image model on this device…';

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => navigate('home')} aria-label="WildSense home">
          <span className="brand-mark"><Leaf size={20} strokeWidth={2.2} /></span><span>Wild<span className="brand-light">Sense</span></span>
        </button>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map(({ id, label }) => <button key={id} className={`nav-link ${screen === id ? 'active' : ''}`} onClick={() => navigate(id)}>{label}</button>)}
        </nav>
        <div className="topbar-actions">
          <span className={`connection-pill ${online ? 'is-online' : 'is-offline'}`}><span className="connection-dot" />{online ? 'Ready to explore' : 'Offline'}</span>
          <button className="more-menu-toggle" aria-expanded={moreMenuOpen} onClick={() => setMoreMenuOpen((open) => !open)}>Explore more <ChevronRight size={14} /></button>
          <button className="icon-button settings-shortcut" aria-label="Open settings" onClick={() => navigate('settings')}><SettingsIcon size={19} /></button>
          <button className="icon-button menu-toggle" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
        {(mobileMenuOpen || moreMenuOpen) && <nav className={`mobile-menu ${mobileMenuOpen ? 'mobile-menu-open' : 'desktop-menu-open'}`} aria-label="Explore WildSense">{navigation.map(({ id, label, Icon }) => <button key={id} onClick={() => navigate(id)}><Icon size={18} />{label}<ChevronRight size={16} /></button>)}<span className="menu-divider">EXPLORE MORE</span><button onClick={() => navigate('missions')}><Leaf size={18} />Touch Grass missions<ChevronRight size={16} /></button><button onClick={() => navigate('passport')}><Compass size={18} />Nature Passport<ChevronRight size={16} /></button><button onClick={() => navigate('walk')}><Footprints size={18} />Digital Detox Walk<ChevronRight size={16} /></button><button onClick={() => navigate('wrapped')}><Award size={18} />Nature Wrapped<ChevronRight size={16} /></button><button onClick={() => navigate('settings')}><SettingsIcon size={18} />Settings<ChevronRight size={16} /></button></nav>}
      </header>

      <main className="main-content">
        <div className="page-heading"><div><p className="eyebrow">YOUR POCKET-SIZED NATURE COMPANION</p><h1>{screenTitle[screen]}</h1></div>{screen !== 'home' && <span className="heading-leaf"><Sprout size={21} /> Take it at your pace</span>}</div>
        {storageError && <div className="alert alert-warning" role="alert"><CircleHelp size={18} /><span><strong>Local storage needs attention.</strong> {storageError} You can keep exploring, but changes may not persist.</span><button className="alert-close" onClick={() => setStorageError('')} aria-label="Dismiss storage warning"><X size={16} /></button></div>}
        {notice && <div className="toast" role="status"><CheckCircle2 size={18} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={16} /></button></div>}

        {screen === 'home' && <HomeScreen entriesCount={entries.length} completedCount={completedCount} quest={questOfDay} onNavigate={navigate} isQuestComplete={completedIds.includes(questOfDay.id)} onCompleteQuest={() => void completeQuest(questOfDay)} completions={missionCompletions} walks={walkRecords} entries={entries} totalXp={totalXp} />}
        {screen === 'home' && <HomeExploreFeatures mission={featuredMission} missionDone={missionCompletions.some((item) => item.id === `${localDateKey(new Date())}:${featuredMission.id}`)} entries={entries} completions={missionCompletions} walks={walkRecords} totalXp={totalXp} onNavigate={navigate} />}
        {screen === 'identify' && <section className="identify-layout">
          <div className="panel identify-panel">
            <div className="section-title-row"><div><span className="step-tag">01 · YOUR DISCOVERY</span><h2>What caught your eye?</h2><p className="muted">Choose or take a photo. It stays right here on your device.</p></div><span className="round-icon"><Camera size={22} /></span></div>
            {identifyState !== 'loading' && file && <div className="identify-actions identify-inline-actions"><button className="button button-secondary" onClick={() => { identifyRequestId.current += 1; setFile(undefined); setIdentifyState('empty'); setIdentifyError(''); setPredictions([]); setProgress(undefined); }}>Cancel photo</button><button className="button button-primary" onClick={() => void identify()}><Sparkles size={17} />{identifyState === 'error' ? 'Try identification again' : 'Identify locally'}<ArrowRight size={17} /></button></div>}
            {!file && <label className="upload-zone" htmlFor="nature-image"><span className="upload-icon"><ImagePlus size={27} /></span><strong>Choose a photo</strong><span>or take one with your camera</span><span className="upload-note">JPEG, PNG, or WebP · up to 12 MB</span><input id="nature-image" type="file" accept="image/*" capture="environment" onChange={(event) => chooseImage(event.currentTarget.files?.[0])} /></label>}
            {file && <div className="preview-wrap"><img className="image-preview" src={previewUrl} alt="Preview of the photo you selected" /><div className="preview-footer"><span><CheckCircle2 size={16} />{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</span><label className="text-button" htmlFor="change-image"><ImagePlus size={15} /> Change photo<input id="change-image" type="file" accept="image/*" capture="environment" onChange={(event) => chooseImage(event.currentTarget.files?.[0])} /></label></div></div>}
            <div className="privacy-note"><ShieldCheck size={18} /><p><strong>Private by design.</strong> Your photo is analyzed on this device. It is not uploaded to an AI service. The first model download needs an internet connection.</p></div>
            {identifyState === 'loading' && <div className="model-progress" role="status" aria-live="polite"><div className="progress-heading"><LoaderCircle className="spin" size={18} /><span>{progressMessage}</span></div>{progressPercent !== undefined && progress?.status === 'progress' && <div className="progress-track" role="progressbar" aria-label="Model download progress" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progressPercent}%` }} /></div>}<small>The app and nature quests remain available while the model is prepared.</small></div>}
            {identifyState === 'error' && <div className="alert alert-error" role="alert"><CircleHelp size={19} /><span>{identifyError}</span></div>}
            {identifyState === 'complete' && predictions.length > 0 && <div className="results-block"><div className="result-header"><span className="step-tag">02 · MODEL PREDICTIONS</span><span className="local-tag"><ShieldCheck size={14} /> On-device</span></div><p className="result-intro">Here are the image classifier’s closest matches—not verified species identifications.</p><ol className="prediction-list">{predictions.map((prediction, index) => <li key={`${prediction.label}-${index}`}><div className="prediction-copy"><span className="prediction-rank">{String(index + 1).padStart(2, '0')}</span><strong>{prediction.label}</strong></div><div className="prediction-score"><span>{(prediction.score * 100).toFixed(1)}%</span><div className="score-track"><span style={{ width: `${prediction.score * 100}%` }} /></div></div></li>)}</ol><div className="uncertainty-note"><Eye size={17} /><p>Scores reflect the model’s ranking, not verified certainty. This general ImageNet classifier can confuse similar subjects and may not recognize local species. Check a trusted field guide before drawing conclusions.</p></div><label className="environment-select">Where did you notice it? <span>Optional · your note, not GPS</span><select value={selectedEnvironment} onChange={(event) => setSelectedEnvironment(event.target.value)}><option value="">Not specified</option>{environments.map((environment) => <option key={environment}>{environment}</option>)}</select></label><div className="result-actions"><button className="button button-primary" onClick={() => void saveDiscovery()} disabled={savedResult}>{savedResult ? <Check size={17} /> : <BookOpen size={17} />}{savedResult ? 'Saved to journal' : 'Save to journal'}</button><button className="button button-secondary" onClick={() => { setFile(undefined); setIdentifyState('empty'); setPredictions([]); setIdentifyError(''); setProgress(undefined); }}><RotateCcw size={16} /> Try another photo</button></div></div>}
          </div>
          <aside className="side-stack"><div className="panel model-card"><span className="card-kicker">BEFORE YOU BEGIN</span><h3>A gentle heads-up</h3><ul className="tip-list"><li><span className="tip-number">1</span><span>The first time, WildSense downloads its image model from Hugging Face.</span></li><li><span className="tip-number">2</span><span>It can take a little while and uses device storage.</span></li><li><span className="tip-number">3</span><span>After a successful download, later use may work offline while your browser keeps the cached files.</span></li></ul><div className="soft-divider" /><p className="tiny-note"><Wifi size={15} /> Model availability offline depends on browser storage and cache retention.</p></div><div className="panel reassurance-card"><div className="mini-leaf"><Leaf size={19} /></div><strong>Not every mystery needs a name.</strong><p>Looking closely is already a wonderful way to know a place.</p></div></aside>
        </section>}
        {screen === 'quests' && <><QuestsScreen completedIds={completedIds} busyQuestId={busyQuestId} onComplete={(quest) => void completeQuest(quest)} /><div className="more-explore-grid"><button className="secondary-explore-link" onClick={() => navigate('missions')}><Leaf size={18} /><span><strong>Touch Grass missions</strong><small>Daily outdoors invitations · earn XP</small></span><ChevronRight size={16} /></button><button className="secondary-explore-link" onClick={() => navigate('walk')}><Footprints size={18} /><span><strong>Digital Detox Walk</strong><small>Choose a mindful 5, 10, or 20 minute walk</small></span><ChevronRight size={16} /></button><WeeklyRecapLink onOpen={() => navigate('wrapped')} /><button className="secondary-explore-link" onClick={() => navigate('passport')}><Compass size={18} /><span><strong>Nature Passport</strong><small>Your saved field notes and milestones</small></span><ChevronRight size={16} /></button></div></>}
        {screen === 'missions' && <MissionScreen completions={missionCompletions} busyId={busyMissionId} onComplete={(mission, observation) => void completeNatureMission(mission, observation)} />}
        {screen === 'passport' && <NaturePassportScreen entries={entries} completions={missionCompletions} walks={walkRecords} totalXp={totalXp} onSaveObservation={recordObservation} />}
        {screen === 'wrapped' && <WeeklyRecapScreen entries={entries} completions={missionCompletions} walks={walkRecords} onNavigate={navigate} />}
        {screen === 'identify' && file && identifyState !== 'loading' && identifyState !== 'complete' && <div className="identify-actions identify-page-actions"><button className="button button-secondary" onClick={() => { identifyRequestId.current += 1; setFile(undefined); setIdentifyState('empty'); setIdentifyError(''); setPredictions([]); setProgress(undefined); }}>Cancel photo</button><button className="button button-primary" onClick={() => void identify()}><Sparkles size={17} />{identifyState === 'error' ? 'Try identification again' : 'Identify locally'}<ArrowRight size={17} /></button></div>}
        {screen === 'journal' && <JournalScreen entries={entries} editingNotes={editingNotes} savingEntryId={savingEntryId} onNavigate={navigate} onDelete={removeEntry} onSaveNotes={persistNotes} onChangeNotes={(id, value) => setEditingNotes((current) => ({ ...current, [id]: value }))} onEnvironmentChange={updateEnvironment} onSaveObservation={recordObservation} />}
        {screen === 'settings' && <SettingsScreen modelState={modelState} online={online} entriesCount={entries.length} onClear={() => void clearData()} />}
        <div className={screen === 'walk' ? '' : 'screen-hidden'} aria-hidden={screen !== 'walk'}><DigitalDetoxWalk onComplete={saveWalk} onSaveReflection={saveWalkReflection} /></div>
      </main>

      <footer className="site-footer"><span><Leaf size={14} /> Made for the quietly curious</span><button onClick={() => navigate('settings')}>Privacy & settings <ArrowRight size={14} /></button></footer>
      <nav className="mobile-tabbar" aria-label="Main navigation">{navigation.map(({ id, label, Icon }) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => navigate(id)} aria-current={screen === id ? 'page' : undefined}><Icon size={20} /><span>{label}</span></button>)}</nav>
    </div>
  );
}

function HomeScreen({ entriesCount, completedCount, quest, onNavigate, isQuestComplete, onCompleteQuest }: { entriesCount: number; completedCount: number; quest: NatureQuest; onNavigate: (screen: Screen) => void; isQuestComplete: boolean; onCompleteQuest: () => void; completions?: MissionCompletion[]; walks?: WalkRecord[]; entries?: JournalEntry[]; totalXp?: number }) {
  return <div className="home-screen"><section className="hero panel"><div className="hero-copy"><span className="hero-overline"><span className="sun-dot" /> A NEW DAY TO NOTICE</span><h2>Step outside.<br /><em>Come back curious.</em></h2><p>Little discoveries turn an ordinary walk into a story worth keeping. Let’s see what’s growing, moving, or quietly waiting nearby.</p><button className="button button-cream" onClick={() => onNavigate('identify')}><Camera size={18} /> Identify a discovery <ArrowRight size={17} /></button><div className="hero-reassurance"><ShieldCheck size={15} /> Your photos stay on your device</div></div><div className="hero-art" aria-hidden="true"><div className="sun-orb" /><div className="hill hill-back" /><div className="hill hill-front" /><div className="art-stem stem-one"><span /><span /><i /></div><div className="art-stem stem-two"><span /><span /><i /></div><div className="art-stem stem-three"><span /><span /><i /></div><div className="art-flower flower-one"><i /><i /><i /><i /><b /></div><div className="art-flower flower-two"><i /><i /><i /><i /><b /></div><span className="art-sparkle sparkle-one">✦</span><span className="art-sparkle sparkle-two">✳</span></div><div className="hero-index">FIELD NOTE <strong>001</strong><span>·</span> OPEN YOUR SENSES</div></section>
    <section className="welcome-strip"><div className="welcome-icon"><Sparkles size={19} /></div><div><strong>New around here? You’re in the right place.</strong><p>Start with a photo, try today’s little quest, or simply notice one new thing on your next walk.</p></div><button className="icon-button" aria-label="Learn about WildSense" onClick={() => onNavigate('settings')}><ArrowRight size={19} /></button></section>
    <div className="home-grid"><section className="panel quest-feature"><div className="card-topline"><span className="card-kicker">A LITTLE QUEST FOR TODAY</span><span className={`quest-status ${isQuestComplete ? 'done' : ''}`}>{isQuestComplete ? <><Check size={13} /> COMPLETE</> : '5 MIN · OUTDOORS'}</span></div><div className="quest-feature-content"><div className="quest-illustration"><Flower2 size={29} /><span>01</span></div><div><span className="quest-category">{quest.category}</span><h2>{quest.title}</h2><p>{quest.description}</p></div></div><div className="quest-card-footer"><span><Eye size={15} /> No equipment or downloads needed</span><div>{!isQuestComplete && <button className="text-button" onClick={onCompleteQuest}><CheckCircle2 size={16} /> Mark complete</button>}<button className="text-button arrow-link" onClick={() => onNavigate('quests')}>Explore quests <ArrowRight size={15} /></button></div></div></section>
      <section className="panel explore-card"><div className="explore-top"><div className="explore-icon"><Mountain size={21} /></div><span className="card-kicker">YOUR WILD MOMENTS</span></div><div className="stat-row"><div><strong>{entriesCount}</strong><span>journal {entriesCount === 1 ? 'entry' : 'entries'}</span></div><div className="stat-separator" /><div><strong>{completedCount}<small>/{quests.length}</small></strong><span>quests tried</span></div></div><div className="explore-bottom"><span>A lovely start, wherever you are.</span><button className="text-button arrow-link" onClick={() => onNavigate('journal')}>Visit journal <ArrowRight size={15} /></button></div></section></div>
    <div className="home-footnote"><span className="footnote-line" /><p>Nature doesn’t need a checklist. These are just little invitations to slow down.</p><span className="footnote-line" /></div></div>;
}

function QuestsScreen({ completedIds, busyQuestId, onComplete }: { completedIds: string[]; busyQuestId: string; onComplete: (quest: NatureQuest) => void }) {
  const completeCount = countCompletedQuestIds(completedIds);
  return <section className="quests-screen"><div className="quest-progress panel"><div className="progress-icon"><Compass size={22} /></div><div className="quest-progress-copy"><strong>Your noticing practice</strong><p>{completeCount === 0 ? 'Pick any small invitation that feels right today.' : `${completeCount} of ${quests.length} little invitations completed.`}</p><div className="quest-meter"><span style={{ width: `${(completeCount / quests.length) * 100}%` }} /></div></div><div className="progress-count"><strong>{completeCount}<small>/{quests.length}</small></strong><span>completed</span></div></div><div className="quest-grid">{quests.map((quest, index) => { const done = completedIds.includes(quest.id); const isToday = quest.id === getQuestOfTheDay().id; return <article className={`quest-card panel ${done ? 'quest-completed' : ''}`} key={quest.id}><div className="quest-card-head"><div className={`quest-number ${done ? 'done-number' : ''}`}>{done ? <Check size={17} /> : String(index + 1).padStart(2, '0')}</div><div><span className="quest-category">{quest.category}{isToday ? ' · TODAY' : ''}</span><h2>{quest.title}</h2></div><span className="duration-pill">{quest.duration}</span></div><p className="quest-description">{quest.description}</p><ol className="quest-steps">{quest.steps.map((step) => <li key={step}><span><Check size={12} /></span>{step}</li>)}</ol><div className="reflection-prompt"><Feather size={15} /><span>{quest.reflection}</span></div><div className="quest-actions">{done ? <span className="completed-label"><CheckCircle2 size={16} /> Nicely noticed</span> : <button className="button button-small button-primary" disabled={busyQuestId === quest.id} onClick={() => onComplete(quest)}>{busyQuestId === quest.id ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{busyQuestId === quest.id ? 'Saving…' : 'Mark complete'}</button>}</div></article>; })}</div><p className="quest-disclaimer"><ShieldCheck size={15} /> Every quest is optional, works offline, and needs no location access.</p></section>;
}

function JournalScreen({ entries, editingNotes, savingEntryId, onNavigate, onDelete, onSaveNotes, onChangeNotes, onEnvironmentChange, onSaveObservation }: { entries: JournalEntry[]; editingNotes: Record<string, string>; savingEntryId: string; onNavigate: (screen: Screen) => void; onDelete: (entry: JournalEntry) => void; onSaveNotes: (entry: JournalEntry) => void; onChangeNotes: (id: string, value: string) => void; onEnvironmentChange: (entry: JournalEntry, environment: string) => void; onSaveObservation: (text: string, category: string, environment?: string) => Promise<void> }) {
  return <section className="journal-screen"><div className="journal-summary panel"><div className="summary-icon"><BookOpen size={21} /></div><div><strong>{entries.length} {entries.length === 1 ? 'moment' : 'moments'} noticed</strong><p>Your private nature notes, kept on this device.</p></div><button className="button button-primary" onClick={() => onNavigate('identify')}><Camera size={17} /> Save a discovery</button></div>
    {entries.length === 0 ? <div className="empty-state panel"><div className="empty-illustration"><Flower2 size={35} /></div><h2>Your journal is waiting</h2><p>When something in nature catches your eye, identify it or write down a small observation.</p><button className="button button-primary" onClick={() => onNavigate('identify')}>Find your first discovery <ArrowRight size={16} /></button><p className="empty-tip">Your journal is private and stays in this browser.</p></div> : <div className="journal-grid">{entries.map((entry) => <article className="journal-card panel" key={entry.id}><div className="journal-card-top"><ImageThumbnail image={entry.image} alt={`Saved image for ${entry.label}`} /><div className="journal-meta"><time dateTime={entry.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(entry.createdAt))}</time><h2>{entry.label}</h2><span className="model-caption">{entry.kind === 'observation' ? 'Your field observation' : entry.kind === 'walk' ? 'Your walk reflection' : 'Image classifier prediction'}</span></div><button className="icon-button delete-button" aria-label={`Delete ${entry.label} from journal`} onClick={() => onDelete(entry)}><Trash2 size={17} /></button></div><label className="notes-label" htmlFor={`notes-${entry.id}`}>Field notes</label><textarea id={`notes-${entry.id}`} rows={3} maxLength={1000} placeholder="What did you notice? Add a thought, place, or feeling…" value={editingNotes[entry.id] ?? entry.notes} onChange={(event) => onChangeNotes(entry.id, event.target.value)} /><div className="journal-card-footer"><span>{(editingNotes[entry.id] ?? entry.notes).length}/1000</span><button className="text-button" disabled={savingEntryId === entry.id} onClick={() => onSaveNotes(entry)}>{savingEntryId === entry.id ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{savingEntryId === entry.id ? 'Saving…' : 'Save notes'}</button></div><label className="journal-environment-label" htmlFor={`environment-${entry.id}`}>Environment <span>optional, selected by you</span></label><select id={`environment-${entry.id}`} value={entry.environment ?? ''} onChange={(event) => onEnvironmentChange(entry, event.target.value)}><option value="">Not specified</option>{environments.map((environment) => <option key={environment}>{environment}</option>)}</select></article>)}</div>}
    <JournalObservationComposer onSave={onSaveObservation} />
  </section>;
}

function SettingsScreen({ modelState, online, entriesCount, onClear }: { modelState: ModelState; online: boolean; entriesCount: number; onClear: () => void }) {
  const modelLabel: Record<ModelState, string> = { 'not-loaded': 'Not loaded yet', loading: 'Loading on this device', ready: 'Loaded in this session', error: 'Previous load failed — retry in Identify' };
  return <section className="settings-layout"><div className="settings-main panel"><div className="settings-intro"><div className="settings-emblem"><Leaf size={23} /></div><div><span className="card-kicker">YOUR PRIVACY, FIRST</span><h2>WildSense keeps things close.</h2><p>Explore at your own pace, without an account or a trail of personal data.</p></div></div><div className="settings-row"><span className="settings-row-icon"><Sparkles size={18} /></span><div><strong>Image model</strong><p>{modelLabel[modelState]}. Model files are requested only when you start identification.</p></div><span className={`status-chip ${modelState === 'ready' ? 'status-green' : ''}`}><span />{modelState === 'ready' ? 'Ready' : modelState === 'loading' ? 'Loading' : 'On demand'}</span></div><div className="settings-row"><span className="settings-row-icon">{online ? <Wifi size={18} /> : <WifiOff size={18} />}</span><div><strong>Connection</strong><p>{online ? 'Online now. The first model download and updates need a connection.' : 'Offline now. Quests, this app shell, and locally saved notes can still be used.'}</p></div><span className={`status-chip ${online ? 'status-green' : ''}`}><span />{online ? 'Online' : 'Offline'}</span></div><div className="settings-row"><span className="settings-row-icon"><BookOpen size={18} /></span><div><strong>Local journal & quests</strong><p>{entriesCount} journal {entriesCount === 1 ? 'entry is' : 'entries are'} stored in this browser’s IndexedDB. Browser storage is not a permanent backup.</p></div><span className="status-chip status-green"><span />On device</span></div><div className="privacy-explainer"><h3><ShieldCheck size={18} /> How image privacy works</h3><p>Photo classification runs in your browser using an open image model. The model files are downloaded from Hugging Face when you first identify something. Photos are not sent to our servers or to a hosted AI service. WildSense contains no analytics or tracking.</p><p>The model is a general-purpose ImageNet classifier, not a specialist nature guide. Its top match is a suggestion, not a verified species fact.</p></div><div className="settings-meta"><span>WildSense <strong>v1.0.0</strong></span><a href="https://huggingface.co/Xenova/vit-base-patch16-224" target="_blank" rel="noreferrer">Model source <ArrowRight size={13} /></a></div></div><aside className="panel data-panel"><span className="card-kicker">ON THIS DEVICE</span><div className="data-illustration"><Cloud size={27} /><ArrowDown size={17} /></div><h2>Your data, your choice.</h2><p>Clearing browser site data may remove your entries. There’s no cloud backup. You can also clear WildSense’s journal and quest progress here.</p><button className="button button-danger" onClick={onClear}><Trash2 size={16} /> Clear local data</button><span className="data-footnote">A confirmation appears before anything is deleted.</span></aside><div className="version-note"><CircleHelp size={15} /> Offline model availability depends on successful download, browser cache limits, and the browser not evicting files. It is never guaranteed.</div></section>;
}

function HomeExploreFeatures({ mission, missionDone, entries, completions, walks, totalXp, onNavigate }: { mission: NatureMission; missionDone: boolean; entries: JournalEntry[]; completions: MissionCompletion[]; walks: WalkRecord[]; totalXp: number; onNavigate: (screen: Screen) => void }) {
  return <div className="home-explore-features">
    <section className="touch-grass-feature panel"><div className="touch-grass-art"><Leaf size={32} /><span>OUTSIDE IS A GOOD PLACE TO START</span></div><div className="touch-grass-copy"><span className="card-kicker">TODAY’S TOUCH GRASS MISSION · {mission.durationMinutes} MIN</span><h2>{mission.title}</h2><p>{mission.description}</p><div className="touch-grass-footer">{missionDone ? <span className="mission-completed-label"><CheckCircle2 size={16} /> Complete today · +{MISSION_XP} XP</span> : <button className="button button-primary" onClick={() => onNavigate('missions')}><Sparkles size={16} /> Start mission</button>}<button className="text-button arrow-link" onClick={() => onNavigate('missions')}>Explore all missions <ArrowRight size={15} /></button></div></div></section>
    <PassportSummary entries={entries} completions={completions} walks={walks} xp={totalXp} onNavigate={onNavigate} />
    <div className="home-secondary-actions"><button className="secondary-explore-link" onClick={() => onNavigate('walk')}><Footprints size={18} />Digital Detox Walk<ChevronRight size={16} /></button><WeeklyRecapLink onOpen={() => onNavigate('wrapped')} /></div>
  </div>;
}


function JournalObservationComposer({ onSave }: { onSave: (text: string, category: string, environment?: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState('Other');
  const [environment, setEnvironment] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(text.trim(), category, environment || undefined);
      setText('');
    } finally { setSaving(false); }
  };
  return <section className="journal-observation panel"><div className="section-heading"><div><span className="card-kicker">LOOK CLOSER</span><h2>Save a small observation</h2></div><Eye size={19} /></div><p className="passport-help">No photo or AI needed. A curious detail is enough.</p><div className="look-prompt-cloud">{observationPrompts.map((prompt) => <button className="look-prompt-chip" key={prompt} onClick={() => setText((current) => current ? `${current}\n${prompt} ` : `${prompt} `)}>{prompt}</button>)}</div><label htmlFor="journal-quick-observation">What did you notice?</label><textarea id="journal-quick-observation" rows={3} maxLength={1000} value={text} onChange={(event) => setText(event.target.value)} placeholder="A sound, a pattern, a shift in light…"/><div className="observation-fields"><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{['Plants', 'Animals', 'Sky', 'Sound', 'Textures', 'Patterns', 'Small life', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></label><label>Environment (optional)<select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="">Not specified</option>{environments.map((item) => <option key={item}>{item}</option>)}</select></label></div><button className="button button-primary" disabled={!text.trim() || saving} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={15} /> : <BookOpen size={15} />}{saving ? 'Saving…' : 'Save observation'}</button></section>;
}
export default App;
