'use client';
import { isHoldExercise } from '@/lib/exercise-profiles';
import { useState, useEffect, useRef, useId } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Dumbbell,
  ChartNoAxesCombined,
  Settings2,
  Search,
  Bell,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Video,
  Clock3,
  Flame,
  TrendingUp,
  Activity,
  Check,
  LogOut,
  CircleHelp,
  X,
  Copy,
  CheckCircle2,
  Play,
  SlidersHorizontal,
  Menu,
  ScanLine,
  Download,
  ShieldCheck,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  Brand,
  Avatar,
  MotionArt,
  ExerciseArt,
  EmptyState,
  Modal,
  SectionTitle,
  TextAction,
} from './ui';
import { exercises, starterBlocks, exerciseName } from '@/lib/catalog';
import type { WorkspaceData, ClassView, Block, ClientView, Plan } from '@/lib/types';
import { apiCommand, fetchJson } from '@/lib/client';
import { authClient } from '@/lib/auth-client';
import { useTimeFormat } from './time-provider';
const Studio = dynamic(() => import('./studio').then((m) => m.Studio), {
  ssr: false,
  loading: () => <div className="page-loading">Opening your studio…</div>,
});
const nav = [
  { id: 'dashboard', name: 'Overview', icon: LayoutDashboard },
  { id: 'clients', name: 'My clients', icon: Users },
  { id: 'sessions', name: 'Sessions', icon: CalendarDays },
  { id: 'plans', name: 'Workout plans', icon: Dumbbell },
  { id: 'analytics', name: 'Insights', icon: ChartNoAxesCombined },
];
type Command = Record<string, unknown>;
export function Workspace({ initial, view }: { initial: WorkspaceData; view: string }) {
  const { dateLabel, timeLabel, timeZone } = useTimeFormat();
  const searchInput = useRef<HTMLInputElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const navigationId = useId();
  const [smallScreen, setSmallScreen] = useState(false);
  const mutationVersion = useRef(0);
  const pendingMutations = useRef(0);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  const router = useRouter(),
    [data, setData] = useState(initial),
    [search, setSearch] = useState(''),
    [modal, setModal] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(''),
    [syncWarning, setSyncWarning] = useState(''),
    [mobileMenu, setMobileMenu] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => {
      setSmallScreen(media.matches);
      if (!media.matches) setMobileMenu(false);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!mobileMenu || !smallScreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenu(false);
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handle);
      menuTrigger.current?.focus();
    };
  }, [mobileMenu, smallScreen]);
  useEffect(() => {
    if (initial.demo) return;
    let active = true;
    let fetching = false;
    const controller = new AbortController();
    async function update() {
      if (fetching || pendingMutations.current || document.hidden) return;
      fetching = true;
      const version = mutationVersion.current;
      try {
        const fresh = await fetchJson<WorkspaceData>('/api/workspace', {
          signal: controller.signal,
        });
        if (active && version === mutationVersion.current) {
          setData(fresh);
          setSyncWarning('');
        }
      } catch {
        if (active) setSyncWarning('Studio updates are delayed. We’ll reconnect automatically.');
      } finally {
        fetching = false;
      }
    }
    void update();
    const interval = setInterval(() => void update(), 30000);
    const onFocus = () => void update();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [initial.demo, view]);
  const [selectedClient, setSelectedClient] = useState<ClientView | null>(null),
    [selectedPlan, setSelectedPlan] = useState<Plan | null>(null),
    [activeClass, setActiveClass] = useState<ClassView | null>(null),
    [inviteResult, setInviteResult] = useState(''),
    [filter, setFilter] = useState('upcoming'),
    [range, setRange] = useState(30);
  const base = data.demo ? '/demo' : '/app',
    coach = data.user.role === 'coach';
  const activeView = [
    'dashboard',
    'clients',
    'sessions',
    'plans',
    'analytics',
    'settings',
    'studio',
    'practice',
    'setup',
  ].includes(view)
    ? view
    : 'dashboard';
  const upcoming = data.classes
    .filter((c) => c.status === 'scheduled' || c.status === 'live')
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const history = data.classes.filter(
    (c) => c.status === 'completed' && +new Date(c.startsAt) >= Date.now() - range * 86400000,
  );
  const summaries = history
    .flatMap((c) => c.participants.map((p) => p.summary))
    .filter((s) => s !== null);
  const samples = summaries.reduce((n, s) => n + s.trackedSamples, 0),
    average = samples
      ? Math.round(summaries.reduce((n, s) => n + s.scoreTotal, 0) / samples)
      : null;
  const reps = summaries.reduce((n, s) => n + s.totalReps, 0);
  function go(next: string) {
    setMobileMenu(false);
    setSearch('');
    router.push(`${base}?view=${next}`);
  }
  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 5000);
  }
  function show(name: string) {
    setMobileMenu(false);
    setError('');
    setInviteResult('');
    setModal(name);
  }
  async function refresh() {
    if (!data.demo) setData(await fetchJson<WorkspaceData>('/api/workspace'));
  }
  async function command(payload: Command): Promise<Record<string, unknown>> {
    mutationVersion.current++;
    pendingMutations.current++;
    setBusy(true);
    setError('');
    try {
      if (!data.demo) {
        const result = await apiCommand(payload);
        await refresh();
        return result;
      }
      const id = `sample-${crypto.randomUUID()}`;
      if (payload.action === 'invite')
        return { url: 'Sample preview — create an account to generate a real invitation.' };
      setData((current) => {
        if (payload.action === 'savePlan') {
          const plan = {
            id: (payload.id as string) || id,
            name: payload.name as string,
            description: payload.description as string,
            blocks: payload.blocks as Block[],
          };
          return {
            ...current,
            plans: payload.id
              ? current.plans.map((p) => (p.id === payload.id ? plan : p))
              : [plan, ...current.plans],
          };
        }
        if (payload.action === 'deletePlan')
          return { ...current, plans: current.plans.filter((p) => p.id !== payload.id) };
        if (payload.action === 'profile')
          return {
            ...current,
            user: { ...current.user, name: payload.name as string, goal: payload.goal as string },
          };
        if (payload.action === 'createClass') {
          const item: ClassView = {
            id,
            title: payload.title as string,
            startsAt: payload.startsAt as string,
            duration: payload.duration as number,
            capacity: payload.capacity as number,
            planId: (payload.planId as string) || null,
            status: 'scheduled',
            exercise: 'squat',
            revision: 0,
            paused: false,
            coachId: current.user.id,
            coachName: current.user.name,
            startedAt: null,
            endedAt: null,
            participants: current.clients
              .filter((c) => (payload.participantIds as string[]).includes(c.id))
              .map((c) => ({
                id: c.id,
                name: c.name,
                helpRequested: false,
                metric: null,
                summary: null,
              })),
          };
          return { ...current, classes: [item, ...current.classes] };
        }
        if (payload.action === 'classControl')
          return {
            ...current,
            classes: current.classes.map((c) =>
              c.id === payload.id
                ? {
                    ...c,
                    status:
                      payload.control === 'start'
                        ? 'live'
                        : payload.control === 'end'
                          ? 'completed'
                          : payload.control === 'cancel'
                            ? 'cancelled'
                            : c.status,
                    paused:
                      payload.control === 'pause'
                        ? true
                        : payload.control === 'resume'
                          ? false
                          : c.paused,
                    exercise: (payload.exercise as ClassView['exercise']) || c.exercise,
                    revision: c.revision + 1,
                    startedAt: payload.control === 'start' ? new Date().toISOString() : c.startedAt,
                    endedAt: payload.control === 'end' ? new Date().toISOString() : c.endedAt,
                  }
                : c,
            ),
          };
        return current;
      });
      return { ok: true, id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please retry.';
      setError(message);
      throw err;
    } finally {
      mutationVersion.current++;
      pendingMutations.current--;
      setBusy(false);
    }
  }
  async function openClass(c: ClassView) {
    if (data.demo) {
      setActiveClass({ ...c, status: 'live', startedAt: new Date().toISOString() });
      go('studio');
      return;
    }
    window.location.href = `/studio/${c.id}`;
  }
  const searchClients = data.clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) || c.email.includes(search.toLowerCase()),
  );
  const searchPlans = data.plans.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="app-layout">
      {smallScreen && mobileMenu && (
        <button
          className="navigation-backdrop"
          aria-label="Dismiss navigation"
          onClick={() => setMobileMenu(false)}
          tabIndex={-1}
        />
      )}
      <aside
        ref={sidebar}
        id={navigationId}
        className={`sidebar ${mobileMenu ? 'open' : ''}`}
        inert={smallScreen && !mobileMenu}
        role={smallScreen && mobileMenu ? 'dialog' : undefined}
        aria-modal={smallScreen && mobileMenu ? true : undefined}
        aria-label="Workspace navigation"
      >
        <button
          className="icon-button navigation-close"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        >
          <X size={22} />
        </button>
        <Link href={base} className="brand-link">
          <Brand />
        </Link>
        <button className="studio-selector" onClick={() => show('studioInfo')}>
          <span className="studio-monogram">{data.studio?.name[0] || 'Y'}</span>
          <span>
            <strong>{data.studio?.name || 'Your studio'}</strong>
            <small>
              {data.demo ? 'Sample workspace' : coach ? 'Coach workspace' : 'Trainee workspace'}
            </small>
          </span>
          <ChevronDown size={14} />
        </button>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav
            .filter((n) => coach || n.id !== 'clients')
            .map((n) => (
              <Link
                key={n.id}
                href={`${base}?view=${n.id}`}
                className={`nav-item ${activeView === n.id ? 'active' : ''}`}
                onClick={() => {
                  setMobileMenu(false);
                  setSearch('');
                }}
              >
                <n.icon size={19} />
                <span>{n.name}</span>
                {n.id === 'clients' && <small>{data.clients.length}</small>}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="coach-note">
            <span className="note-orbit">✳</span>
            <strong>
              A human touch.
              <br />A smarter way to train.
            </strong>
            <p>Every rep is a chance to move a little better.</p>
            <button onClick={() => go('practice')}>
              Try camera coaching
              <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={`nav-item ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => go('settings')}
          >
            <Settings2 size={18} /> Settings
          </button>
          <button className="nav-item" onClick={() => show('help')}>
            <CircleHelp size={18} /> Help & resources
            <ArrowUpRight size={14} />
          </button>
          <button className="profile-button" onClick={() => go('settings')}>
            <Avatar name={data.user.name} small />
            <span>
              <strong>{data.user.name}</strong>
              <small>{coach ? 'Fitness coach' : 'Trainee'}</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell" inert={smallScreen && mobileMenu}>
        <header className="topbar">
          <button
            className="icon-button mobile-toggle"
            ref={menuTrigger}
            aria-label="Open navigation"
            aria-expanded={mobileMenu}
            aria-controls={navigationId}
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            Your workspace<span>/</span>
            <strong>
              {activeView === 'studio'
                ? 'Live studio'
                : activeView === 'practice'
                  ? 'Camera coaching'
                  : nav.find((n) => n.id === activeView)?.name || 'Settings'}
            </strong>
          </div>
          <div className="top-actions">
            <div className="search-wrap">
              <Search size={17} />
              <input
                ref={searchInput}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your workspace…"
                aria-label="Search your workspace"
              />
              <kbd>⌘ K</kbd>
            </div>
            <button
              className="icon-button notification-button"
              aria-label="Upcoming session notifications"
              onClick={() => show('notifications')}
            >
              <Bell size={19} />
              {upcoming.length > 0 && <i />}
            </button>
            <Avatar name={data.user.name} small />
          </div>
        </header>
        {data.demo && (
          <div className="demo-banner">
            <span>
              <span className="status-dot" /> Sample studio · All client data and history are
              illustrative.
            </span>
            <Link href="/login">
              Make it yours
              <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        <main className={`workspace-content ${activeView === 'studio' ? 'studio-content' : ''}`}>
          {syncWarning && (
            <p className="inline-notice" role="status">
              {syncWarning}
            </p>
          )}
          {search && activeView !== 'clients' && activeView !== 'plans' && (
            <div className="search-results panel">
              <SectionTitle
                title={`Results for “${search}”`}
                action={
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => setSearch('')}
                  >
                    <X size={16} />
                  </button>
                }
              />
              {searchClients.slice(0, 4).map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedClient(c);
                    show('client');
                  }}
                >
                  <Avatar name={c.name} small />
                  {c.name}
                  <ArrowUpRight size={15} />
                </button>
              ))}
              {searchPlans.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedPlan(p);
                    show('plan');
                  }}
                >
                  <Dumbbell size={17} />
                  {p.name}
                  <ArrowUpRight size={15} />
                </button>
              ))}
              {!searchClients.length && !searchPlans.length && (
                <p>No clients or plans match your search.</p>
              )}
            </div>
          )}
          {activeView === 'dashboard' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">LET’S MAKE MOVEMENT MATTER</span>
                  <h1>
                    {coach ? 'A good day to make progress.' : 'Your next chapter starts here.'}
                    <span className="greeting-spark">✳</span>
                  </h1>
                  <p>
                    {coach
                      ? `Welcome back, ${data.user.name.split(' ')[0]}. A little guidance. A lot of possibility.`
                      : `Welcome, ${data.user.name.split(' ')[0]}. Show up for yourself, one session at a time.`}
                  </p>
                </div>
                <button
                  className="button dark"
                  onClick={() => (coach ? show('schedule') : go('practice'))}
                >
                  {coach ? <Plus size={17} /> : <ScanLine size={17} />}{' '}
                  {coach ? 'Schedule session' : 'Camera practice'}
                </button>
              </div>
              <div className="stats-grid">
                <Stat
                  label={coach ? 'Active clients' : 'Upcoming sessions'}
                  value={coach ? data.clients.length : upcoming.length}
                  detail={coach ? 'People in your studio' : 'On your calendar'}
                  icon={<Users size={19} />}
                  color="lime"
                />
                <Stat
                  label="Sessions completed"
                  value={history.length}
                  detail={`In the last ${range} days`}
                  icon={<Video size={19} />}
                  color="lavender"
                />
                <Stat
                  label="Average form estimate"
                  value={average === null ? '—' : `${average}%`}
                  detail={samples ? `${samples} tracked summaries` : 'Complete a tracked session'}
                  icon={<Activity size={19} />}
                  color="peach"
                />
                <Stat
                  label="Reps completed"
                  value={reps}
                  detail="Across tracked sessions"
                  icon={<Flame size={19} />}
                  color="sky"
                />
              </div>
              <div className="dashboard-middle">
                <section className="session-hero">
                  <div className="hero-copy">
                    <span className="hero-kicker">
                      <span className="status-dot" />
                      {upcoming[0]?.status === 'live' ? 'LIVE NOW' : 'NEXT IN YOUR STUDIO'}
                    </span>
                    <h2>{upcoming[0]?.title || 'Good movement starts with connection.'}</h2>
                    <p>
                      {upcoming[0]
                        ? `${dateLabel(upcoming[0].startsAt)} · ${timeLabel(upcoming[0].startsAt)} · ${upcoming[0].duration} min`
                        : coach
                          ? 'Bring your clients together for a session that moves them forward.'
                          : 'Your coach’s sessions will appear here. Practice locally while you wait.'}
                    </p>
                    {upcoming[0] && (
                      <div className="avatar-stack">
                        {upcoming[0].participants.slice(0, 4).map((p, i) => (
                          <Avatar key={p.id} name={p.name} index={i} small />
                        ))}
                        <span>
                          {upcoming[0].participants.length}{' '}
                          {coach ? 'clients joining' : 'your enrollment'}
                        </span>
                      </div>
                    )}
                    <button
                      className="button dark"
                      onClick={() =>
                        upcoming[0]
                          ? void openClass(upcoming[0])
                          : coach
                            ? show('schedule')
                            : go('sessions')
                      }
                    >
                      {upcoming[0]
                        ? 'Open studio'
                        : coach
                          ? 'Create your first session'
                          : 'View sessions'}
                      <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <MotionArt />
                  <span className="hero-decoration">MOVE BETTER. TOGETHER.</span>
                </section>
                <section className="panel insight-card">
                  <SectionTitle
                    title="Progress, in perspective"
                    action={<span className="pill">{data.demo ? 'Sample' : `${range} days`}</span>}
                  />
                  <div className="insight-number">
                    <strong>
                      {average ?? '—'}
                      <small>{average !== null ? '%' : ''}</small>
                    </strong>
                    <span>
                      average form
                      <br />
                      estimate
                    </span>
                  </div>
                  <ProgressChart classes={history} />
                  <div className="insight-foot">
                    <span>
                      <span className="chart-dot" /> Movement consistency
                    </span>
                    <button
                      className="icon-button"
                      aria-label="See insights"
                      onClick={() => go('analytics')}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                </section>
              </div>
              <div className="dashboard-bottom">
                <section className="panel">
                  <SectionTitle
                    title={coach ? 'Your people, your impact' : 'Recent sessions'}
                    action={
                      <TextAction onClick={() => go(coach ? 'clients' : 'analytics')}>
                        View all
                      </TextAction>
                    }
                  />
                  {coach ? (
                    data.clients.length ? (
                      <div className="client-table">
                        <div className="table-head">
                          <span>CLIENT</span>
                          <span>LAST SESSION</span>
                          <span>FORM ESTIMATE</span>
                          <span />
                        </div>
                        {data.clients.slice(0, 4).map((c, i) => {
                          const last = data.classes.find(
                            (s) =>
                              s.status === 'completed' && s.participants.some((p) => p.id === c.id),
                          );
                          const result = last?.participants.find((p) => p.id === c.id)?.summary;
                          const score = result?.trackedSamples
                            ? Math.round(result.scoreTotal / result.trackedSamples)
                            : null;
                          return (
                            <button
                              className="client-row"
                              key={c.id}
                              onClick={() => {
                                setSelectedClient(c);
                                show('client');
                              }}
                            >
                              <span className="person-cell">
                                <Avatar name={c.name} index={i} small />
                                <span>
                                  <strong>{c.name}</strong>
                                  <small>{c.goal}</small>
                                </span>
                              </span>
                              <span>{last ? dateLabel(last.startsAt) : 'Getting started'}</span>
                              <span>
                                {score !== null ? (
                                  <span className="score-pill">
                                    {score}% <TrendingUp size={13} />
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </span>
                              <ArrowUpRight size={16} />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState
                        title="Build your circle."
                        text="Invite your first client and help them find their stride."
                        action={
                          <button className="button lime" onClick={() => show('invite')}>
                            Invite a client
                          </button>
                        }
                      />
                    )
                  ) : (
                    <SessionRows classes={history.slice(0, 3)} onOpen={openClass} />
                  )}
                </section>
                <section className="panel plan-spotlight">
                  <SectionTitle
                    title="Built for better movement"
                    action={<TextAction onClick={() => go('plans')}>Plans</TextAction>}
                  />
                  <div className="spotlight-art lavender">
                    <ExerciseArt exercise="pushup" />
                    <span className="pill">WORKOUT LIBRARY</span>
                  </div>
                  <h3>{data.plans[0]?.name || 'Your next plan'}</h3>
                  <p>
                    {data.plans[0]?.description ||
                      'Create intentional sessions with clear sets, reps, and recovery.'}
                  </p>
                  <button
                    className="text-link"
                    onClick={() => {
                      if (data.plans[0]) {
                        setSelectedPlan(data.plans[0]);
                        show('plan');
                      } else if (coach) {
                        setSelectedPlan(null);
                        show('plan');
                      } else go('plans');
                    }}
                  >
                    {data.plans[0]
                      ? `${data.plans[0].blocks.length} exercises · View plan`
                      : coach
                        ? 'Create a plan'
                        : 'Explore the movement library'}
                    <ArrowRight size={16} />
                  </button>
                </section>
              </div>
            </>
          )}
          {activeView === 'clients' && (
            <>
              <PageHeading
                eyebrow="GROW TOGETHER"
                title="People make the progress."
                text="A clear view of every person you coach."
                action={
                  <button className="button dark" onClick={() => show('invite')}>
                    <Plus size={17} /> Invite client
                  </button>
                }
              />
              <div className="list-toolbar">
                <span>{searchClients.length} clients in your studio</span>
                <span className="pill">
                  <Users size={14} /> Active members
                </span>
              </div>
              <div className="client-card-grid">
                {searchClients.map((c, i) => (
                  <button
                    className="panel client-card"
                    key={c.id}
                    onClick={() => {
                      setSelectedClient(c);
                      show('client');
                    }}
                  >
                    <div>
                      <Avatar name={c.name} index={i} />
                      <ArrowUpRight size={18} />
                    </div>
                    <h3>{c.name}</h3>
                    <p>{c.email}</p>
                    <span className="goal-pill">{c.goal}</span>
                    <footer>
                      <span>Joined {dateLabel(c.joinedAt)}</span>
                      <span className="status-dot" /> Active
                    </footer>
                  </button>
                ))}
              </div>
              {!searchClients.length && (
                <EmptyState
                  title={search ? 'No matching clients.' : 'Your people will be here.'}
                  text={
                    search
                      ? 'Try another name or email.'
                      : 'Start with an invitation, then build something stronger together.'
                  }
                  action={
                    <button className="button lime" onClick={() => show('invite')}>
                      Invite client
                    </button>
                  }
                />
              )}
            </>
          )}
          {activeView === 'sessions' && (
            <>
              <PageHeading
                eyebrow="A LITTLE STRUCTURE. A LOT OF PROGRESS."
                title="Make time for movement."
                text="Your coaching calendar, all in one place."
                action={
                  coach ? (
                    <button className="button dark" onClick={() => show('schedule')}>
                      <Plus size={17} /> Schedule session
                    </button>
                  ) : undefined
                }
              />
              <div className="list-toolbar">
                <div className="segmented">
                  {['upcoming', 'completed', 'cancelled'].map((f) => (
                    <button
                      key={f}
                      className={filter === f ? 'selected' : ''}
                      onClick={() => setFilter(f)}
                    >
                      {f[0].toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                <span className="subtle">
                  <CalendarDays size={16} />
                  {timeZone}
                </span>
              </div>
              <div className="panel">
                <SessionRows
                  classes={data.classes
                    .filter((c) =>
                      filter === 'upcoming'
                        ? ['scheduled', 'live'].includes(c.status)
                        : c.status === filter,
                    )
                    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))}
                  onOpen={openClass}
                  onCancel={
                    coach
                      ? async (c) => {
                          try {
                            await command({ action: 'classControl', id: c.id, control: 'cancel' });
                            notify('Session cancelled.');
                          } catch {}
                        }
                      : undefined
                  }
                />
              </div>
            </>
          )}
          {activeView === 'plans' && (
            <>
              <PageHeading
                eyebrow="TRAIN WITH INTENTION"
                title="Good plans. Better movement."
                text="Give every session a clear purpose."
                action={
                  coach ? (
                    <button
                      className="button dark"
                      onClick={() => {
                        setSelectedPlan(null);
                        show('plan');
                      }}
                    >
                      <Plus size={17} /> Create plan
                    </button>
                  ) : undefined
                }
              />
              <SectionTitle
                title="Your workout plans"
                detail={`${searchPlans.length} plans ready for your studio`}
              />
              <div className="plan-grid">
                {searchPlans.map((p, i) => (
                  <button
                    className="panel workout-card"
                    key={p.id}
                    onClick={() => {
                      setSelectedPlan(p);
                      show('plan');
                    }}
                  >
                    <div className={`workout-cover ${['lavender', 'lime', 'peach'][i % 3]}`}>
                      <ExerciseArt exercise={p.blocks[0]?.exercise} />
                      <span className="pill">{p.blocks.length} EXERCISES</span>
                      <span className="cover-arrow">
                        <ArrowUpRight size={20} />
                      </span>
                    </div>
                    <div className="workout-info">
                      <span className="eyebrow">COACH-CREATED PLAN</span>
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                      <footer>
                        <Dumbbell size={15} />
                        {p.blocks.reduce((n, b) => n + b.sets, 0)} sets<span>·</span>
                        {p.blocks.some((b) => isHoldExercise(b.exercise))
                          ? 'Reps & holds'
                          : 'Rep-based training'}
                      </footer>
                    </div>
                  </button>
                ))}
              </div>
              {!searchPlans.length && (
                <EmptyState
                  title="A strong session starts with a plan."
                  text="Add exercises, set a comfortable pace, and make recovery part of the work."
                  action={
                    coach ? (
                      <button
                        className="button lime"
                        onClick={() => {
                          setSelectedPlan(null);
                          show('plan');
                        }}
                      >
                        Create plan
                      </button>
                    ) : undefined
                  }
                />
              )}
              <SectionTitle
                title="Movement library"
                detail="Four supported exercises. Clear guidance for each one."
              />
              <div className="exercise-grid">
                {exercises.map((e) => (
                  <button
                    className="exercise-tile"
                    key={e.id}
                    onClick={() => {
                      go('practice');
                    }}
                  >
                    <div className={`exercise-cover ${e.color}`}>
                      <ExerciseArt exercise={e.id} />
                    </div>
                    <h3>{e.name}</h3>
                    <p>
                      {e.group} · {e.equipment}
                    </p>
                    <span>
                      {e.view}
                      <ArrowUpRight size={15} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {activeView === 'analytics' && (
            <>
              <PageHeading
                eyebrow="SEE HOW FAR YOU’VE COME"
                title="The progress behind the reps."
                text="Insights from tracked sessions, with room for the human story."
                action={
                  <select
                    aria-label="Insights date range"
                    value={range}
                    onChange={(e) => setRange(Number(e.target.value))}
                  >
                    {[7, 30, 90].map((n) => (
                      <option value={n} key={n}>
                        Last {n} days
                      </option>
                    ))}
                  </select>
                }
              />
              <div className="stats-grid">
                <Stat
                  label="Completed sessions"
                  value={history.length}
                  detail="Within the selected period"
                  color="lime"
                  icon={<CheckCircle2 size={19} />}
                />
                <Stat
                  label="Form estimate"
                  value={average === null ? '—' : `${average}%`}
                  detail="Average of tracked summaries"
                  color="lavender"
                  icon={<Activity size={19} />}
                />
                <Stat
                  label="Total tracked reps"
                  value={reps}
                  detail="Across completed sessions"
                  color="peach"
                  icon={<Flame size={19} />}
                />
                <Stat
                  label="Coaching time"
                  value={`${history.reduce((n, c) => n + c.duration, 0)}m`}
                  detail="Scheduled durations, not active time"
                  color="sky"
                  icon={<Clock3 size={19} />}
                />
              </div>
              <section className="panel analytics-chart">
                <SectionTitle
                  title="Movement quality over time"
                  detail="Geometry-based estimates · compare alongside your coach’s feedback"
                />
                <ProgressChart classes={history} large />
              </section>
              <section className="panel">
                <SectionTitle
                  title="Session history"
                  action={
                    <span className="pill">{data.demo ? 'Illustrative data' : 'Your studio'}</span>
                  }
                />
                <SessionRows classes={history} onOpen={openClass} />
              </section>
              <p className="microcopy">
                Form scores reflect a limited set of camera-visible criteria and are not a validated
                fitness rating. Tracking confidence, camera placement, and exercise variation affect
                estimates.
              </p>
            </>
          )}
          {activeView === 'settings' && (
            <>
              <PageHeading
                eyebrow="YOUR SPACE, YOUR WAY"
                title="Make yourself at home."
                text="Manage your profile, membership, and privacy."
              />
              <div className="settings-grid">
                <section className="panel">
                  <SectionTitle title="Your profile" />
                  <form
                    className="form-stack"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      try {
                        await command({
                          action: 'profile',
                          name: f.get('name'),
                          goal: f.get('goal'),
                        });
                        notify('Profile saved.');
                      } catch {}
                    }}
                  >
                    <label>
                      Name
                      <input
                        name="name"
                        defaultValue={data.user.name}
                        minLength={2}
                        maxLength={80}
                        required
                      />
                    </label>
                    <label>
                      Email
                      <input value={data.user.email} disabled />
                    </label>
                    <label>
                      My focus
                      <input
                        name="goal"
                        defaultValue={data.user.goal}
                        maxLength={160}
                        minLength={2}
                        required
                      />
                    </label>
                    <button className="button dark" disabled={busy}>
                      Save profile
                    </button>
                  </form>
                </section>
                <section className="panel">
                  <SectionTitle title="Privacy, by design" />
                  <div className="settings-feature">
                    <ShieldCheck size={21} />
                    <div>
                      <h3>Analysis stays close to you.</h3>
                      <p>
                        Camera frames are processed on your device. Live video is shared only after
                        you join a class and consent to its group setting. No video is recorded.
                      </p>
                    </div>
                  </div>
                  <Link href="/privacy" className="text-link">
                    Read the privacy guide
                    <ArrowUpRight size={16} />
                  </Link>
                  <div className="settings-feature">
                    <Download size={21} />
                    <div>
                      <h3>Your data belongs with you.</h3>
                      <p>Download your profile, memberships, and workout summaries.</p>
                    </div>
                  </div>
                  {data.demo ? (
                    <button
                      className="button outline"
                      onClick={() => notify('Create an account to export your own data.')}
                    >
                      Export my data
                    </button>
                  ) : (
                    <a className="button outline" href="/api/export">
                      Export my data
                    </a>
                  )}
                </section>
                <section className="panel">
                  <SectionTitle
                    title="Studio membership"
                    action={<span className="pill">{data.billing}</span>}
                  />
                  <p>
                    Payment services are{' '}
                    {data.services.billing
                      ? 'configured for your studio.'
                      : 'not connected yet. No payment is required for this local build.'}
                  </p>
                  <button
                    className="button outline"
                    disabled={!data.services.billing || data.demo}
                    onClick={async () => {
                      try {
                        const r = await fetchJson<{ url: string }>('/api/billing', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: data.billing === 'active' ? 'portal' : 'checkout',
                          }),
                        });
                        window.location.href = r.url;
                      } catch (err) {
                        notify(err instanceof Error ? err.message : 'Please retry.');
                      }
                    }}
                  >
                    {data.billing === 'active'
                      ? 'Manage subscription'
                      : 'View subscription checkout'}
                    <ArrowUpRight size={16} />
                  </button>
                </section>
                <section className="panel">
                  <SectionTitle title="Account" />
                  <p>
                    {data.demo
                      ? 'You’re exploring the sample studio. Create an account for your own workspace.'
                      : 'Your account role is set during onboarding. Contact the studio operator for role or deletion requests.'}
                  </p>
                  {data.demo ? (
                    <Link href="/login" className="button lime">
                      Create an account
                      <ArrowRight size={16} />
                    </Link>
                  ) : (
                    <button
                      className="button outline"
                      onClick={async () => {
                        await authClient.signOut();
                        window.location.href = '/login';
                      }}
                    >
                      <LogOut size={17} /> Sign out
                    </button>
                  )}
                </section>
              </div>
            </>
          )}
          {activeView === 'practice' && <CameraPractice />}
          {activeView === 'studio' && (
            <Studio
              initialClass={activeClass || upcoming[0]}
              user={data.user}
              demo={data.demo}
              services={data.services}
              onExit={() => {
                setActiveClass(null);
                go('sessions');
              }}
              onDemoControl={command}
            />
          )}
        </main>
        <footer className="workspace-footer">
          <span>Small steps. Stronger tomorrows.</span>
          <span>
            Fuzzfit <span className="brand-period">✳</span>
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {error && !modal && (
        <div className="toast error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {data.user.role === 'unset' && (
        <Onboarding
          invited={view === 'setup'}
          userName={data.user.name}
          busy={busy}
          error={error}
          onSubmit={async (payload) => {
            try {
              await command(payload);
              const invite = new URLSearchParams(window.location.search).get('invite');
              window.location.href = invite ? `/invite?code=${encodeURIComponent(invite)}` : '/app';
            } catch {}
          }}
        />
      )}
      {modal && (
        <Modal
          title={
            modal === 'invite'
              ? 'Invite someone to move better.'
              : modal === 'schedule'
                ? 'Make time for a great session.'
                : modal === 'plan'
                  ? selectedPlan?.name || 'Build your next workout.'
                  : modal === 'client'
                    ? selectedClient?.name || 'Client profile'
                    : modal === 'notifications'
                      ? 'Coming up in your studio'
                      : modal === 'studioInfo'
                        ? 'Your studio'
                        : 'A little guidance goes a long way.'
          }
          wide={modal === 'plan' || modal === 'schedule'}
          onClose={() => setModal(null)}
        >
          {modal === 'invite' && (
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const r = await command({
                    action: 'invite',
                    email: new FormData(e.currentTarget).get('email'),
                  });
                  setInviteResult(String(r.url));
                } catch {}
              }}
            >
              <p>
                Share a personal invite link with your client. It is bound to their email and
                expires after 7 days.
              </p>
              <label>
                Client’s email
                <input name="email" type="email" placeholder="client@example.com" required />
              </label>
              <button className="button dark" disabled={busy}>
                Create invite link
                <ArrowRight size={17} />
              </button>
              {inviteResult && (
                <div className="invite-result">
                  <p>
                    {data.demo
                      ? inviteResult
                      : 'Your invite link is ready. Share it directly with your client.'}
                  </p>
                  {!data.demo && (
                    <>
                      <input aria-label="Invitation link" readOnly value={inviteResult} />
                      <button
                        type="button"
                        className="button outline"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(inviteResult);
                            notify('Invite link copied.');
                          } catch {
                            notify('Select the link and copy it manually.');
                          }
                        }}
                      >
                        <Copy size={16} /> Copy link
                      </button>
                    </>
                  )}
                </div>
              )}
            </form>
          )}
          {modal === 'schedule' && (
            <ScheduleForm
              data={data}
              busy={busy}
              onSubmit={async (payload) => {
                try {
                  await command(payload);
                  setModal(null);
                  notify(data.demo ? 'Sample session added.' : 'Session scheduled.');
                } catch {}
              }}
            />
          )}
          {modal === 'plan' && (
            <PlanForm
              plan={selectedPlan}
              editable={coach}
              busy={busy}
              onSubmit={async (payload) => {
                try {
                  await command(payload);
                  setModal(null);
                  notify('Workout plan saved.');
                } catch {}
              }}
              onDelete={async () => {
                if (!selectedPlan) return;
                try {
                  await command({ action: 'deletePlan', id: selectedPlan.id });
                  setModal(null);
                  notify('Workout plan deleted.');
                } catch {}
              }}
            />
          )}
          {modal === 'client' && selectedClient && (
            <div className="client-detail">
              <Avatar name={selectedClient.name} />
              <p>{selectedClient.email}</p>
              <div className="goal-pill">{selectedClient.goal}</div>
              <SectionTitle
                title="Training together"
                detail={`Joined ${dateLabel(selectedClient.joinedAt)}`}
              />
              <SessionRows
                classes={data.classes.filter((c) =>
                  c.participants.some((p) => p.id === selectedClient.id),
                )}
                onOpen={async (c) => {
                  setModal(null);
                  await openClass(c);
                }}
              />
            </div>
          )}
          {modal === 'notifications' && (
            <SessionRows
              classes={upcoming.slice(0, 5)}
              onOpen={async (c) => {
                setModal(null);
                await openClass(c);
              }}
            />
          )}
          {modal === 'studioInfo' && (
            <div className="form-stack">
              <p>
                <strong>{data.studio?.name || 'Your studio is being set up'}</strong>
              </p>
              <p>
                {data.demo
                  ? 'This sample shows the coaching experience. All people and history are illustrative. Use camera practice for actual local pose analysis.'
                  : `You’re signed in as ${data.user.name}, with the ${data.user.role} role.`}
              </p>
              <Link className="button lime" href={data.demo ? '/login' : '/app?view=settings'}>
                {data.demo ? 'Create your own studio' : 'Manage your profile'}
                <ArrowRight size={16} />
              </Link>
            </div>
          )}
          {modal === 'help' && (
            <div className="resource-list">
              <h3>Get camera-ready</h3>
              <p>
                Use a side view, good lighting, and a stable camera. Keep the required joints in
                frame and leave space around you.
              </p>
              <h3>Understand your estimates</h3>
              <p>
                Tracking confidence measures visibility. Form estimates compare a limited set of
                joint angles and alignment rules. Your coach can adapt guidance to you.
              </p>
              <h3>A shared space to train</h3>
              <p>
                Your camera and microphone are shared with the group only after you join and agree.
                Movement summaries are visible to you and your coach. You can leave video at any
                time.
              </p>
              <Link href="/privacy" className="text-link">
                Camera use & privacy
                <ArrowUpRight size={16} />
              </Link>
              <button
                className="button lime"
                onClick={() => {
                  setModal(null);
                  go('practice');
                }}
              >
                Try camera practice
                <ScanLine size={17} />
              </button>
            </div>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow: string;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <section className="stat-card">
      <div>
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
function ProgressChart({ classes, large = false }: { classes: ClassView[]; large?: boolean }) {
  const { dateLabel } = useTimeFormat();
  const items = [...classes]
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
    .slice(-8)
    .map((c) => {
      const sums = c.participants.flatMap((p) => (p.summary ? [p.summary] : [])),
        samples = sums.reduce((n, s) => n + s.trackedSamples, 0);
      return {
        date: c.startsAt,
        score: samples ? sums.reduce((n, s) => n + s.scoreTotal, 0) / samples : null,
      };
    })
    .filter((c) => c.score !== null);
  if (!items.length)
    return (
      <div className="chart-empty">
        <Activity size={28} />
        <p>Your progress appears after a tracked session.</p>
      </div>
    );
  const points = items
    .map(
      (item, i) =>
        `${30 + i * (340 / Math.max(1, items.length - 1))},${150 - (item.score! / 100) * 120}`,
    )
    .join(' ');
  return (
    <div className={`progress-chart ${large ? 'large' : ''}`}>
      <svg
        viewBox="0 0 400 185"
        role="img"
        aria-label={`Form estimates: ${items.map((i) => `${dateLabel(i.date)} ${Math.round(i.score!)} percent`).join(', ')}`}
      >
        <defs>
          <linearGradient id={`chart-fill-${large}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b0a3ed" stopOpacity=".3" />
            <stop offset="100%" stopColor="#b0a3ed" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[30, 70, 110, 150].map((y) => (
          <line key={y} x1="30" x2="375" y1={y} y2={y} stroke="#eee" strokeDasharray="3 5" />
        ))}
        <polygon
          points={`30,155 ${points} ${items.length > 1 ? '370' : '30'},155`}
          fill={`url(#chart-fill-${large})`}
        />
        <polyline
          points={points}
          fill="none"
          stroke="#8564bc"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {items.map((item, i) => (
          <g key={item.date}>
            <circle
              cx={30 + i * (340 / Math.max(1, items.length - 1))}
              cy={150 - (item.score! / 100) * 120}
              r="4"
              fill="#8564bc"
              stroke="white"
              strokeWidth="2"
            />
            <text
              x={30 + i * (340 / Math.max(1, items.length - 1))}
              y="177"
              textAnchor="middle"
              fill="#606b58"
              fontSize="10"
            >
              {dateLabel(item.date)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
function SessionRows({
  classes,
  onOpen,
  onCancel,
}: {
  classes: ClassView[];
  onOpen: (c: ClassView) => void;
  onCancel?: (c: ClassView) => void;
}) {
  const { timeLabel, timeZone } = useTimeFormat();
  if (!classes.length)
    return (
      <EmptyState
        title="A little space for what’s next."
        text="Sessions will appear here when they’re scheduled or completed."
      />
    );
  return (
    <div className="session-list">
      {classes.map((c) => (
        <div className="session-row" key={c.id}>
          <div className="session-date">
            <strong>
              {Number(
                new Date(c.startsAt).toLocaleDateString('en-IN', { day: 'numeric', timeZone }),
              )}
            </strong>
            <span>
              {new Date(c.startsAt).toLocaleDateString('en-IN', { month: 'short', timeZone })}
            </span>
          </div>
          <div className="session-info">
            <strong>{c.title}</strong>
            <span>
              {timeLabel(c.startsAt)} · {c.duration} min · {c.participants.length}{' '}
              {c.participants.length === 1 ? 'participant' : 'participants'}
            </span>
          </div>
          <span className={`pill ${c.status === 'live' ? 'live-pill' : ''}`}>{c.status}</span>
          <button className="button outline small-button" onClick={() => onOpen(c)}>
            {['completed', 'cancelled'].includes(c.status) ? 'View' : 'Open studio'}
            <ArrowUpRight size={15} />
          </button>
          {c.status === 'scheduled' && onCancel && (
            <button
              className="icon-button"
              aria-label={`Cancel ${c.title}`}
              onClick={() => onCancel(c)}
            >
              <X size={17} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
const Camera = dynamic(() => import('./camera-analyzer').then((m) => m.CameraAnalyzer), {
  ssr: false,
});
function CameraPractice() {
  const [exercise, setExercise] = useState<ClassView['exercise']>('squat');
  return (
    <section className="meeting-practice">
      <div className="practice-heading">
        <div>
          <span className="eyebrow">CAMERA PRACTICE</span>
          <h1>Focus on your movement.</h1>
          <p>Choose a movement, position your camera, then start your set.</p>
        </div>
        <label>
          Movement
          <select
            aria-label="Exercise to practice"
            value={exercise}
            onChange={(event) => setExercise(event.target.value as ClassView['exercise'])}
          >
            {exercises.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Camera exercise={exercise} />
      <p className="practice-privacy">
        Local practice stays on this device. Live class summaries are shared with your coach after
        you join with consent.
      </p>
    </section>
  );
}
function ScheduleForm({
  data,
  busy,
  onSubmit,
}: {
  data: WorkspaceData;
  busy: boolean;
  onSubmit: (c: Command) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const next = new Date(Date.now() + 3600000);
  const local = new Date(next.getTime() - next.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit({
          action: 'createClass',
          title: f.get('title'),
          startsAt: new Date(String(f.get('startsAt'))).toISOString(),
          duration: Number(f.get('duration')),
          capacity: 8,
          planId: f.get('planId') || undefined,
          participantIds: selected,
        });
      }}
    >
      <div className="form-two">
        <label>
          Session title
          <input
            name="title"
            required
            minLength={2}
            maxLength={80}
            placeholder="Full body foundations"
          />
        </label>
        <label>
          Workout plan
          <select name="planId">
            <option value="">Choose at session time</option>
            {data.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date & time
          <input name="startsAt" type="datetime-local" defaultValue={local} required />
        </label>
        <label>
          Duration
          <select name="duration">
            {[30, 45, 60, 90].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="microcopy">
        Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}. Sessions support up to 8
        trainees.
      </p>
      <label>
        Invite your clients <span className="subtle">{selected.length}/8 selected</span>
      </label>
      <div className="participant-picker">
        {data.clients.map((c, i) => (
          <label key={c.id}>
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked
                    ? s.length < 8
                      ? [...s, c.id]
                      : s
                    : s.filter((id) => id !== c.id),
                )
              }
            />
            <Avatar name={c.name} small index={i} />
            {c.name}
          </label>
        ))}
      </div>
      {!data.clients.length && (
        <p className="inline-notice">
          Invite clients to your studio to add them. You can schedule a solo rehearsal now.
        </p>
      )}
      <button className="button dark" disabled={busy}>
        <CalendarDays size={17} />
        {busy ? 'Saving…' : 'Schedule session'}
      </button>
    </form>
  );
}
function PlanForm({
  plan,
  editable,
  busy,
  onSubmit,
  onDelete,
}: {
  plan: Plan | null;
  editable: boolean;
  busy: boolean;
  onSubmit: (c: Command) => void;
  onDelete: () => void;
}) {
  const [blocks, setBlocks] = useState<Block[]>(plan?.blocks || starterBlocks),
    [confirm, setConfirm] = useState(false);
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit({
          action: 'savePlan',
          id: plan?.id,
          name: f.get('name'),
          description: f.get('description'),
          blocks,
        });
      }}
    >
      <label>
        Plan name
        <input
          name="name"
          defaultValue={plan?.name}
          placeholder="Full body foundations"
          minLength={2}
          maxLength={80}
          required
          disabled={!editable}
        />
      </label>
      <label>
        A little context
        <textarea
          name="description"
          defaultValue={plan?.description}
          placeholder="What will this session focus on?"
          maxLength={400}
          disabled={!editable}
        />
      </label>
      <div className="plan-blocks">
        {blocks.map((b, i) => (
          <div className="plan-block" key={i}>
            <span className="block-number">{String(i + 1).padStart(2, '0')}</span>
            <label>
              Exercise
              <select
                aria-label={`Exercise ${i + 1}`}
                value={b.exercise}
                disabled={!editable}
                onChange={(e) =>
                  setBlocks((s) =>
                    s.map((x, j) =>
                      j === i ? { ...x, exercise: e.target.value as Block['exercise'] } : x,
                    ),
                  )
                }
              >
                {exercises.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            {(['sets', 'reps', 'rest'] as const).map((key) => (
              <label key={key}>
                {key === 'reps' && isHoldExercise(b.exercise)
                  ? 'Hold (s)'
                  : key === 'rest'
                    ? 'Rest (s)'
                    : key}
                <input
                  type="number"
                  aria-label={`${key} for exercise ${i + 1}`}
                  min={key === 'rest' ? 0 : 1}
                  max={key === 'sets' ? 10 : key === 'rest' ? 300 : 120}
                  value={b[key]}
                  disabled={!editable}
                  onChange={(e) =>
                    setBlocks((s) =>
                      s.map((x, j) => (j === i ? { ...x, [key]: Number(e.target.value) } : x)),
                    )
                  }
                />
              </label>
            ))}
            {editable && (
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove exercise ${i + 1}`}
                onClick={() => setBlocks((s) => s.filter((_, j) => j !== i))}
                disabled={blocks.length === 1}
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <>
          <button
            type="button"
            className="button outline"
            onClick={() =>
              setBlocks((s) => [...s, { exercise: 'squat', sets: 3, reps: 12, rest: 60 }])
            }
            disabled={blocks.length >= 20}
          >
            <Plus size={16} /> Add exercise
          </button>
          <div className="form-actions">
            <button className="button dark" disabled={busy}>
              Save workout plan
              <Check size={17} />
            </button>
            {plan && (
              <button
                type="button"
                className={`button ${confirm ? 'danger' : 'outline'}`}
                disabled={busy}
                onClick={() => (confirm ? onDelete() : setConfirm(true))}
              >
                <Trash2 size={16} />
                {confirm ? 'Confirm delete' : 'Delete plan'}
              </button>
            )}
          </div>
        </>
      )}
    </form>
  );
}
function Onboarding({
  invited,
  userName,
  busy,
  error,
  onSubmit,
}: {
  invited: boolean;
  userName: string;
  busy: boolean;
  error: string;
  onSubmit: (c: Command) => void;
}) {
  const [role, setRole] = useState(invited ? 'trainee' : 'coach');
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={headingId}
      className="onboarding-overlay"
      onCancel={(event) => event.preventDefault()}
    >
      <section className="onboarding-card panel">
        <Brand />
        <span className="eyebrow">LET’S FIND YOUR PLACE</span>
        <h1 id={headingId}>How do you want to move?</h1>
        <p>
          {invited
            ? 'Your coach invited you as a trainee. Set up your profile to join.'
            : 'Choose your role to set up your workspace.'}
        </p>
        <div className="role-picker">
          <button
            disabled={invited}
            aria-pressed={role === 'coach'}
            className={role === 'coach' ? 'selected' : ''}
            onClick={() => setRole('coach')}
          >
            <Users size={24} />
            <strong>I’m a coach</strong>
            <span>Build a studio. Guide your people.</span>
          </button>
          <button
            aria-pressed={role === 'trainee'}
            className={role === 'trainee' ? 'selected' : ''}
            onClick={() => setRole('trainee')}
          >
            <Dumbbell size={24} />
            <strong>I’m a trainee</strong>
            <span>Join your coach. Find your stride.</span>
          </button>
        </div>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            onSubmit({
              action: 'onboard',
              role,
              name: f.get('name'),
              studioName: f.get('studioName') || undefined,
              adult: f.get('adult') === 'on',
            });
          }}
        >
          <label>
            Your name
            <input name="name" defaultValue={userName} required minLength={2} maxLength={80} />
          </label>
          {role === 'coach' && (
            <label>
              Studio name
              <input name="studioName" placeholder="The Movement Studio" maxLength={80} />
            </label>
          )}
          <label className="checkbox-label">
            <input type="checkbox" name="adult" required />I am 18 or older. I understand this is
            general fitness coaching.
          </label>
          <p className="microcopy">
            Your role is set once. Camera use and sharing have their own consent step.
          </p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <button className="button dark full" disabled={busy}>
            Create my workspace
            <ArrowRight size={17} />
          </button>
        </form>
        <button
          className="text-link"
          onClick={async () => {
            await authClient.signOut();
            window.location.href = '/login';
          }}
        >
          Back to sign in
        </button>
      </section>
    </dialog>
  );
}
