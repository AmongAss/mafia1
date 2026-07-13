import { useState, useEffect } from 'react';

// ==================== ТИПЫ ====================

type RoleType = 'mafia' | 'doctor' | 'civilian' | 'maniac' | 'lover' | 'sheriff';
type PlayerStatus = 'alive' | 'dead';
type ActionStatus = 'normal' | 'blocked';

interface Player {
  id: string;
  name: string;
  role: RoleType;
  status: PlayerStatus;
  actionStatus: ActionStatus;
  sheriffCheckNight?: number; // номер ночи, когда шериф может проверить (1 раз после смерти, только эту ночь)
}

type ActionType = 'kill' | 'heal' | 'block' | 'check';

interface GameEvent {
  id: string;
  type: ActionType;
  actorRole: RoleType;
  targetId: string;
  roundType: 'night' | 'day';
  roundNumber: number;
}

// ==================== РОЛИ ====================

const ROLES: Record<RoleType, { name: string; emoji: string; color: string; team: 'black' | 'red' | 'neutral'; description: string }> = {
  mafia:    { name: 'Мафия',     emoji: '🔪', color: 'bg-red-900 border-red-600 text-red-100',   team: 'black',    description: 'Убивает ночью' },
  maniac:   { name: 'Маньяк',    emoji: '🤡', color: 'bg-purple-900 border-purple-600 text-purple-100', team: 'neutral', description: 'Убивает ночью отдельно от мафии' },
  sheriff:  { name: 'Шериф',    emoji: '⭐', color: 'bg-blue-800 border-blue-500 text-blue-100',   team: 'red',      description: 'Проверяет 1 раз — только ночь смерти!' },
  doctor:   { name: 'Доктор',    emoji: '💉', color: 'bg-green-800 border-green-500 text-green-100',  team: 'red',      description: 'Лечит! Может даже воскресить мёртвого!' },
  lover:    { name: 'Любовница', emoji: '💋', color: 'bg-pink-700 border-pink-400 text-pink-100',    team: 'neutral', description: 'Блокирует игрока на ночь+день' },
  civilian: { name: 'Мирный',    emoji: '👤', color: 'bg-stone-700 border-stone-500 text-stone-200', team: 'red',      description: 'Просто голосует днём' },
};

const LOG_TEMPLATES: Record<ActionType, (actorRole: RoleType) => string> = {
  kill:  (role) => role === 'maniac' ? 'Маньяк убил' : 'Мафия убила',
  heal:  () => 'Доктор вылечил',
  block: () => 'Любовница очаровала',
  check: () => 'Шериф проверил',
};

const LOG_COLORS: Record<ActionType, string> = {
  kill:  'text-red-400',
  heal:  'text-green-400',
  block: 'text-pink-400',
  check: 'text-blue-400',
};

const ACTIONS: Record<ActionType, { name: string; emoji: string; bgColor: string; whoUses: RoleType[] }> = {
  kill:  { name: 'Убить',       emoji: '💀', bgColor: 'bg-red-900/40 text-red-300',   whoUses: ['mafia', 'maniac'] },
  heal:  { name: 'Воскресить/Лечить', emoji: '💚', bgColor: 'bg-green-900/40 text-green-300', whoUses: ['doctor'] },
  block: { name: 'Заблокировать', emoji: '💋', bgColor: 'bg-pink-900/40 text-pink-300',  whoUses: ['lover'] },
  check: { name: 'Проверить',    emoji: '🔍', bgColor: 'bg-blue-900/40 text-blue-300',   whoUses: ['sheriff'] },
};

const uid = () => Math.random().toString(36).slice(2, 9);

// ==================== СЦЕНАРИЙ ВЕДУЩЕГО ====================
// Порядок ночи: Любовница → Мафия → Шериф → Маньяк → Доктор

const SCRIPTS: Record<string, string[]> = {

  nightStart: [
    '🌙 Город засыпает!',
    'Все закрывают глаза.',
    '(ждите пока все закроют глаза)',
  ],

  // 1️⃣ ЛЮБОВНИЦА
  loverWakeUp: [
    '💋 Любовница, просыпайся!',
    '(ждём)',
    '',
    'Кого хочешь очаровать?',
    '(записываем → засыпает)',
  ],

  // 2️⃣ МАФИЯ
  mafiaWakeUp: [
    '🔪 Мафия, просыпайтесь...',
    '(ждём)',
    '',
    'Вы видите друг друга. Обсудите жертву.',
    '(30-60 сек → записываем → засыпают)',
  ],

  // 3️⃣ ШЕРИФ (проверяет только если его убили этой ночью!)
  sheriffWakeUp: [
    '⭐ Шериф, просыпайся!',
    '',
    '(ПОЛЬЗУЕТСЯ 1 РАЗ — только в ночь своей смерти!)',
    '(если шерифа убили этой ночью — он проверяет)',
    '(если нет — пропускаем)',
    '',
    'Кого хочешь проверить?',
    '(показываем карточку → это была последняя проверка!)',
  ],

  // 4️⃣ МАНЯК
  maniacWakeUp: [
    '🤡 Маньяк, проснись!',
    '(ждём)',
    '',
    'Кого хочешь убить?',
    '(записываем → засыпает)',
  ],

  // 5️⃣ ДОКТОР (может воскрешать мёртвых!)
  doctorWakeUp: [
    '💉 Доктор, проснись!',
    '(может лечить даже будучи мёртвым!)',
    '(может даже ВОСКРЕСИТЬ мёртвого игрока!)',
    '(ждём)',
    '',
    'Кого вылечишь или воскресишь?',
    '(записываем → засыпает)',
  ],

  dawn: [
    '☀️ ГОРОД ПРОСЫПАЕТСЯ!',
    '',
    '*(расскажи кто умер / кто воскрес)*',
  ],

  dayStart: [
    '💬 Обсуждение!',
    '(3-5 минут)',
  ],
  
  voting: [
    '🗳️ Голосование!',
    'Кого исключаем?',
    '(считаем голоса)',
  ],
};


export default function App() {
  // ========== STATE ==========
  
  const [players, setPlayers] = useState<Player[]>(() => {
    try { return JSON.parse(localStorage.getItem('m-players') || '[]'); } catch { return []; }
  });
  
  const [events, setEvents] = useState<GameEvent[]>(() => {
    try { return JSON.parse(localStorage.getItem('m-events') || '[]'); } catch { return []; }
  });
  
  const [roundType, setRoundType] = useState<'night' | 'day'>('night');
  const [roundNum, setRoundNum] = useState(1);
  const [showRoundPicker, setShowRoundPicker] = useState(false);
  
  const [newName, setNewName] = useState('');
  const [showRoleModal, setShowRoleModal] = useState<boolean | string>(false);
  
  const [actionType, setActionType] = useState<ActionType>('kill');
  const [actorId, setActorId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [scriptStep, setScriptStep] = useState<string | null>(null);

  useEffect(() => localStorage.setItem('m-players', JSON.stringify(players)), [players]);
  useEffect(() => localStorage.setItem('m-events', JSON.stringify(events)), [events]);

  // ===== ИГРОКИ =====
  const addPlayer = () => {
    if (!newName.trim()) return;
    setPlayers(p => [...p, { 
      id: uid(), 
      name: newName.trim(), 
      role: 'civilian', 
      status: 'alive',
      actionStatus: 'normal'
    }]);
    setNewName('');
  };

  const removePlayer = (id: string) => {
    setPlayers(p => p.filter(x => x.id !== id));
    setEvents(e => e.filter(ev => ev.targetId !== id));
  };

  const changeRole = (id: string, role: RoleType) => {
    setPlayers(p => p.map(x => x.id === id ? { ...x, role } : x));
  };

  const toggleAlive = (id: string) => {
    setPlayers(p => p.map(x => x.id === id ? { 
      ...x, 
      status: x.status === 'alive' ? 'dead' as const : 'alive' as const,
      // Если шериф был оживлён вручную — он больше не имеет права на смертельную проверку
      ...(x.role === 'sheriff' && x.status === 'alive' ? { sheriffCheckNight: undefined } : {})
    } : x));
  };

  const blockPlayer = (pid: string) => {
    setPlayers(p => p.map(x => x.id === pid ? { ...x, actionStatus: 'blocked' as const } : x));
  };
  
  const unblockAll = () => {
    setPlayers(p => p.map(x => ({ ...x, actionStatus: 'normal' as const })));
  };

  // ===== ДЕЙСТВИЯ =====

  const addAction = () => {
    if (!actorId || !targetId) return;
    
    const actor = players.find(x => x.id === actorId);
    
    const event: GameEvent = {
      id: uid(),
      type: actionType,
      actorRole: actor?.role || 'civilian',
      targetId,
      roundType,
      roundNumber: roundNum,
    };
    
    setEvents(e => [...e, event]);
    
    // === ПРИМЕНЯЕМ ЭФФЕКТ ===
    
    if (actionType === 'kill') {
      // УБИЙСТВО
      setPlayers(p => p.map(x => {
        if (x.id !== targetId) return x;
        const updated = { ...x, status: 'dead' as const };
        // ЕСЛИ УБИЛИ ШЕРИФА — даём ему право на 1 проверку в ЭТУ НОЧЬ!
        if (x.role === 'sheriff') {
          updated.sheriffCheckNight = roundNum;
        }
        return updated;
      }));
    }
    
    if (actionType === 'heal') {
      // ДОКТОР: может ЛЕЧИТЬ Живых и ВОСКРЕШАТЬ Мёртвых!
      setPlayers(p => p.map(x => {
        if (x.id !== targetId) return x;
        // Возвращаем к жизни и нормальному статусу
        return { 
          ...x, 
          status: 'alive' as const,
          actionStatus: 'normal' as const,
          // Шериф если воскрес — больше не имеет права на смертельную проверку
          ...(x.role === 'sheriff' ? { sheriffCheckNight: undefined } : {})
        };
      }));
    }
    
    if (actionType === 'block') {
      blockPlayer(targetId);
    }
    
    // ШЕРИФ использовал свою единственную проверку — отбираем право
    if (actionType === 'check') {
      setPlayers(p => p.map(x => {
        if (x.id !== actorId) return x;
        return { ...x, sheriffCheckNight: undefined };
      }));
    }
    
    setActorId('');
    setTargetId('');
  };

  const removeAction = (eid: string) => setEvents(e => e.filter(x => x.id !== eid));
  
  const resetGame = () => {
    if (!confirm('Сбросить игру?')) return;
    setPlayers([]);
    setEvents([]);
    setRoundType('night');
    setRoundNum(1);
    setScriptStep(null);
    localStorage.removeItem('m-players');
    localStorage.removeItem('m-events');
  };

  const getPlayer = (id: string) => players.find(x => x.id === id);
  
  const alive = players.filter(x => x.status === 'alive');
  const dead = players.filter(x => x.status === 'dead');

  // ===== СПЕЦИАЛЬНЫЕ ФИЛЬТРЫ ======
  
  // Шерифы, которые МОГУТ проверить сейчас (убиты в эту ночь и ещё не использовали проверку)
  const sheriffsWhoCanCheck = players.filter(
    p => p.role === 'sheriff' && p.sheriffCheckNight === roundNum && roundType === 'night'
  );
  
  // Докторы для выбора (живые + мёртвые — все!)
  const doctorsForHeal = players.filter(p => p.role === 'doctor');

  // Порядок сценария
  const scriptOrder = roundType === 'night' 
    ? ['nightStart','loverWakeUp','mafiaWakeUp','sheriffWakeUp','maniacWakeUp','doctorWakeUp','dawn']
    : ['dayStart','voting'];

  const currentScriptTexts = scriptStep ? SCRIPTS[scriptStep] || [] : [];

  const nextScriptStep = () => {
    if (!scriptStep) { setScriptStep(scriptOrder[0]); return; }
    const idx = scriptOrder.indexOf(scriptStep);
    if (idx < scriptOrder.length - 1) setScriptStep(scriptOrder[idx + 1]);
    else setScriptStep(null);
  };

  // ===== RENDER =====
  
  return (
    <div className="min-h-screen bg-slate-950 text-white pb-20 md:pb-4">

      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-3 py-2.5">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-bold flex items-center gap-1.5">
              <span className="text-red-400">🔫</span>
              <span className="hidden sm:inline">Mafia —</span>Ведущий
            </h1>
            
            {/* Пикер номера ночи/дня */}
            <div className="relative flex items-center gap-1.5">
              
              <button 
                onClick={() => setShowRoundPicker(p => !p)} 
                className={`px-2.5 py-1 rounded-md text-xs sm:text-sm font-medium transition ${roundType==='night'?'bg-indigo-600':'bg-slate-700 hover:bg-slate-600'}`}>
                🌙 Н{roundNum}
              </button>
  
              <button 
                onClick={() => setShowRoundPicker(p => !p)}
                className={`px-2.5 py-1 rounded-md text-xs sm:text-sm font-medium transition ${roundType==='day'?'bg-amber-600':'bg-slate-700 hover:bg-slate-600'}`}>
                ☀️ Д{roundNum}
              </button>
  
              {/* Выпадающий пикер */}
              {showRoundPicker && (
                <>
                  <div className="fixed inset-0 z-[55]" onClick={()=>setShowRoundPicker(false)}/>
                  
                  <div className="absolute top-full right-0 mt-1 z-[60] bg-slate-800 border border-slate-600 rounded-xl shadow-xl p-3 min-w-[210px]">
                    <div className="text-xs text-slate-400 mb-2 text-center font-bold">📅 Раунд (1–999)</div>
                    
                    <input
                      type="number" min={1} max={999}
                      value={roundNum}
                      onChange={e=>{
                        const v=parseInt(e.target.value);
                        if(!isNaN(v)&&v>=1&&v<=999){setRoundNum(v);setScriptStep(null);}
                      }}
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-xl font-bold focus:outline-none focus:border-indigo-500 text-center mb-2"
                    />
                    
                    <div className="grid grid-cols-4 gap-1">
                      {[1,2,3,4,5,6,7,8].map(n=>(
                        <button key={n} onClick={()=>{setRoundNum(n);setShowRoundPicker(false)}}
                          className={`py-1.5 rounded-lg text-sm font-bold transition ${roundNum===n?'bg-indigo-600':'bg-slate-700 hover:bg-slate-600'}`}>{n}</button>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-4 gap-1 mt-1">
                      {[10,20,50,100].map(n=>(
                        <button key={n} onClick={()=>{setRoundNum(n);setShowRoundPicker(false)}}
                          className={`py-1.5 rounded-lg text-sm font-bold transition ${roundNum===n?'bg-purple-600':'bg-slate-700 hover:bg-slate-600'}`}>{n}</button>
                      ))}
                    </div>

                    <div className="flex gap-1 mt-2 pt-2 border-t border-slate-700">
                      <button onClick={()=>setRoundNum(Math.max(1,roundNum-1))} disabled={roundNum<=1}
                        className="flex-1 py-1.5 bg-red-900/40 hover:bg-red-800/50 disabled:opacity-30 rounded-lg text-xs font-bold transition">−1</button>
                      <button onClick={()=>setRoundNum(roundNum+1)}
                        className="flex-1 py-1.5 bg-emerald-700/50 hover:bg-emerald-600 rounded-lg text-xs font-bold transition">+1</button>
                      <button onClick={() => setRoundNum(roundNum + 5)}
                        className="flex-1 py-1.5 bg-emerald-700/50 hover:bg-emerald-600 rounded-lg text-xs font-bold transition">+5</button>
                      <button onClick={() => setRoundNum(roundNum + 10)}
                        className="flex-1 py-1.5 bg-emerald-700/50 hover:bg-emerald-600 rounded-lg text-xs font-bold transition">+10</button>
                    </div>
                  </div>
                </>
              )}
</div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide flex-wrap">
            <button onClick={() => {
                if(roundType==='night'){setRoundNum(n=>n+1);setRoundType('day');unblockAll();setScriptStep('dayStart')}
                else{setRoundType('night');setRoundNum(n=>n+1);unblockAll();setScriptStep('nightStart')}
              }} className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-md text-xs font-medium shrink-0">
              → След.
            </button>

            <button onClick={() => setShowRoleModal(true)} className="px-2.5 py-1.5 bg-pink-700 hover:bg-pink-600 rounded-md text-xs font-medium shrink-0">
              🎭 Роли
            </button>

            <button onClick={nextScriptStep} className={`px-2.5 py-1.5 rounded-md text-xs font-medium shrink-0 transition ${scriptStep?'bg-purple-600':'bg-purple-800/60 hover:bg-purple-700'}`}>
              📜 {scriptStep?'След.':'Сценарий'}
            </button>

            <button onClick={resetGame} className="px-2.5 py-1.5 bg-red-900/70 hover:bg-red-800 rounded-md text-xs font-medium shrink-0 ml-auto">
              🗑️
            </button>
          </div>
        </div>
      </header>


      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 space-y-4">

        {/* ====== ПАНЕЛЬ СЦЕНАРИЯ ====== */}
        {scriptStep && (
          <div className="bg-gradient-to-r from-indigo-950 to-purple-950 rounded-xl sm:rounded-2xl border border-indigo-500/20 overflow-hidden shadow-xl">
            <div className="flex items-center justify-between bg-black/30 px-4 py-2.5">
              <span className="font-bold text-indigo-200 text-sm">🎬 Что говорить:</span>
              <span className="text-[10px] sm:text-xs bg-indigo-900/60 px-2 py-0.5 rounded-full">{roundType==='night'?'Ночь':'День'} {roundNum}</span>
            </div>
            <div className="p-4 space-y-1.5">
              {currentScriptTexts.map((line, i) => (
                <p key={i} className={`${
                  line.startsWith('(')?'text-yellow-400/80 italic text-xs sm:text-sm pl-3 sm:pl-4 border-l-2 border-yellow-500/30'
                  :line===''?'h-1.5'
                  :line.includes('*')?'text-cyan-300 font-medium'
                  :line.includes('!') && !line.startsWith('(') && !line.includes('*')?'font-semibold text-sm sm:text-base'
                  :'text-sm sm:text-base'
                }`}>{line}</p>
              ))}
              <div className="pt-3 flex gap-2">
                <button onClick={nextScriptStep} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold text-sm transition active:scale-[0.98]">Следующий шаг →</button>
                <button onClick={()=>setScriptStep(null)} className="py-2.5 px-4 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm transition">✕</button>
              </div>
            </div>
          </div>
        )}

        {!scriptStep && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {(roundType==='night'
              ? ['nightStart','loverWakeUp','mafiaWakeUp','sheriffWakeUp','maniacWakeUp','doctorWakeUp','dawn']
              : ['dayStart','voting']
            ).map(s=>(
              <button key={s} onClick={()=>setScriptStep(s)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0 ${
                  roundType==='night'?'bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-200':'bg-amber-900/40 hover:bg-amber-800/60 text-amber-200'
                }`}>
                {SCRIPTS[s][0]}
              </button>
            ))}
          </div>
        )}

        {/* === Добавление игрока === */}
        <section className="bg-slate-800/60 rounded-xl border border-slate-700/50">
          <form onSubmit={e=>{e.preventDefault();addPlayer()}} className="flex gap-2 p-2.5">
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Имя игрока..." autoFocus
              className="flex-1 min-w-0 bg-slate-900/80 border border-slate-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-pink-500"
            />
            <button type="submit" disabled={!newName.trim()}
              className="px-4 py-2.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-sm transition whitespace-nowrap active:scale-[0.97]">
              +
            </button>
          </form>
        </section>


        {/* === Карточки игроков === */}
        {players.length > 0 && (
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
            {players.map(player => {
              const role = ROLES[player.role];
              const isDead = player.status === 'dead';
              const isBlocked = !isDead && player.actionStatus === 'blocked';
              
              // Особые метки для шерифа с правом на проверку
              const sheriffCanCheck = player.role === 'sheriff' && isDead && player.sheriffCheckNight === roundNum;

              return (
                <div
                  key={player.id}
                  className={`group relative rounded-xl sm:rounded-2xl border transition-all cursor-pointer ${
                    isDead 
                      ? 'border-red-900/40 bg-red-950/20 opacity-45' 
                      : isBlocked
                        ? 'border-pink-500/50 bg-pink-950/10 ring-1 ring-pink-500/20'
                        : 'border-slate-700/40 bg-slate-800/60 hover:border-slate-500 active:scale-[0.98]'
                  } ${sheriffCanCheck ? 'ring-2 ring-blue-500 animate-pulse' : ''}`}
                  onClick={() => setShowRoleModal(player.id)}
                >
                  {/* Метка "ЗАБЛОКИРОВАН" */}
                  {isBlocked && (
                    <div className="absolute top-1 right-1 z-10">
                      <span className="bg-pink-600 text-white text-[8px] sm:text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">💋</span>
                    </div>
                  )}
                  
                  {/* Метка для шерифа со смертью */}
                  {sheriffCanCheck && (
                    <div className="absolute top-1 left-1 z-10">
                      <span className="bg-blue-600 text-white text-[8px] sm:text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                        ⭐ 1×
                      </span>
                    </div>
                  )}

                  <div className={`${role.color} rounded-t-xl sm:rounded-t-2xl px-2.5 pt-2.5 pb-2 sm:px-4 sm:pt-4 sm:pb-3`}>
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-xl sm:text-3xl leading-none">{role.emoji}</span>
                      <div className="text-right min-w-0">
                        <div className={`font-black text-xs sm:text-base leading-tight truncate ${isDead?'line-through':''}`}>{player.name}</div>
                        <div className="text-[9px] sm:text-[11px] opacity-75 hidden sm:block">{role.name}{isDead&&player.role==='sheriff'&&player.sheriffCheckNight===roundNum?' ⭐1×':''}</div>
                      </div>
                    </div>
                    <div className="mt-1 sm:mt-2 text-[8px] sm:text-[10px] opacity-55 italic hidden sm:block">{role.description}</div>
                  </div>

                  <div className="px-2 sm:px-4 py-1.5 sm:py-3 flex items-center justify-between">
                    <button
                      onClick={(e)=>{e.stopPropagation();toggleAlive(player.id)}}
                      className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition active:scale-95 ${
                        isDead ? 'bg-green-700/40 text-green-300' : 'bg-red-700/40 text-red-300'
                      }`}
                    >
                      {isDead ? '♻️' : '💀'}
                    </button>

                    <select
                      value={player.role}
                      onChange={(e)=>{e.stopPropagation();changeRole(player.id, e.target.value as RoleType)}}
                      onClick={(e)=>e.stopPropagation()}
                      className="bg-slate-900 border border-slate-600 rounded-lg px-1 py-0.5 sm:px-1.5 sm:py-1 text-[9px] sm:text-xs focus:outline-none max-w-[70px]"
                    >
                      {(Object.entries(ROLES) as [RoleType, typeof ROLES[RoleType]][]).map(([k,r])=><option key={k} value={k}>{r.emoji}</option>)}
                    </select>

                    <button
                      onClick={(e)=>{e.stopPropagation();removePlayer(player.id)}}
                      className="p-1 text-slate-500 hover:text-red-400 active:scale-90 transition text-xs"
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {players.length === 0 && (
          <div className="text-center py-12 sm:py-16 text-slate-500">
            <div className="text-4xl sm:text-5xl mb-3">👥</div>
            <p className="text-sm">Добавьте игроков выше</p>
          </div>
        )}


        <div className="grid lg:grid-cols-2 gap-4">

          {/* ==== ЗАПИСЬ ДЕЙСТВИЙ ==== */}
          <section className="bg-slate-800/60 rounded-xl sm:rounded-2xl border border-slate-700/50 overflow-hidden order-last lg:order-first">
            <h3 className="font-semibold px-4 py-2.5 sm:py-3 bg-slate-800/80 border-b border-slate-700/50 text-sm flex items-center justify-between">
              <span>✍️ Действие</span>
              <span className="text-[10px] text-slate-500">{ACTIONS[actionType].emoji} {ACTIONS[actionType].name}</span>
            </h3>
            
            <div className="p-3 sm:p-4 space-y-3">
              
              {/* Тип действия */}
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.entries(ACTIONS) as [ActionType, typeof ACTIONS[ActionType]][]).map(([key, act])=>{
                  const isActive = actionType===key;
                  return (
                    <button key={key} onClick={() => setActionType(key)}
                      className={`py-2 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-medium transition-all active:scale-[0.98] ${
                        isActive ? `${act.bgColor} ring-2 ring-white/20` : 'bg-slate-700/60 hover:bg-slate-700 text-slate-300'
                      }`}>
                      <span className="mr-1">{act.emoji}</span><span className="hidden xs:inline">{act.name.split('/')[0]}</span>
                    </button>
                  );
                })}
              </div>

              {/* Кто действует */}
              <div>
                <label className="block text-[10px] sm:text-[11px] text-slate-400 mb-1">
                  Кто {actionType==='heal'?ACTIONS.heal.name.toLowerCase():ACTIONS[actionType].name.toLowerCase()}?
                </label>
                
                {/* ДОКТОР — особый случай: показываем всех докторов (и живых и мёртвых) */}
                {actionType === 'heal' ? (
                  <select value={actorId} onChange={e=>setActorId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2.5 focus:outline-none focus:border-green-500 text-sm">
                    <option value="">— Выбрать доктора —</option>
                    
                    <optgroup label="💀 Мёртвые (тоже лечат!)">
                      {doctorsForHeal.filter(x=>x.status==='dead').map(p=><option key={p.id} value={p.id}>💀 {p.name}</option>)}
                    </optgroup>
                    
                    <optgroup label="💚 Живые">
                      {doctorsForHeal.filter(x=>x.status==='alive').map(p=><option key={p.id} value={p.id}>💚 {p.name}</option>)}
                    </optgroup>
                  </select>
                ) : actionType === 'check' ? (
                  /* ШЕРИФ — только те, кто может проверить сейчас */
                  <select value={actorId} onChange={e=>setActorId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 text-sm">
                    <option value="">— Шериф —</option>
                    
                    {roundType === 'night' && sheriffsWhoCanCheck.length > 0 ? (
                      <>
                        <optgroup label="⭐ Убит сегодня ночью (1× проверка!)">
                          {sheriffsWhoCanCheck.map(p=><option key={p.id} value={p.id}>⭐ {p.name} (последний шанс!)</option>)}
                        </optgroup>
                        
                        {/* Живые шерифы тоже могут проверять как обычно */}
                        {players.filter(x=>x.status==='alive'&&x.role==='sheriff').length > 0 && (
                          <optgroup label="💚 Живой шериф">
                            {players.filter(x=>x.status==='alive'&&x.role==='sheriff').map(p=><option key={p.id} value={p.id}>💚 {p.name}</option>)}
                          </optgroup>
                        )}
                      </>
                    ) : (
                      <>
                        <optgroup label="💚 Живые">
                          {players.filter(x=>x.status==='alive'&&x.role==='sheriff').map(p=><option key={p.id} value={p.id}>💚 {p.name}</option>)}
                        </optgroup>
                        {players.some(x=>x.role==='sheriff'&&x.status==='dead') && (
                          <optgroup label="💀 Мёртвые (уже использовал проверку)">
                            {players.filter(x=>x.role==='sheriff'&&x.status==='dead').map(p=><option disabled key={p.id} value="" className="opacity-40">💀 {p.name} ✗ уже проверял</option>)}
                          </optgroup>
                        )}
                      </>
                    )}
                  </select>
                ) : (
                  /* Остальные роли: обычный выбор */
                  <select value={actorId} onChange={e=>setActorId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2.5 focus:outline-none focus:border-pink-500 text-sm">
                    <option value="">— Выбрать —</option>
                    {players.filter(x=>x.status==='alive'&&ACTIONS[actionType].whoUses.includes(x.role))
                      .filter(x=>x.actionStatus!=='blocked'||actionType==='kill')
                      .map(p=><option key={p.id} value={p.id}>{ROLES[p.role].emoji} {p.name}</option>)}
                  </select>
                )}
                
                {/* Подсказки */}
                {actionType === 'check' && sheriffsWhoCanCheck.length > 0 && (
                  <p className="text-[10px] text-blue-400 mt-1 flex items-center gap-1">
                    ⭐ Шериф{sheriffsWhoCanCheck.length>1?'и':''} имеет{(sheriffsWhoCanCheck.length>1?'ют':'')} право на 1 проверку!
                  </p>
                )}
                
                {actionType === 'heal' && (
                  <p className="text-[10px] text-green-400 mt-1 flex items-center gap-1">
                    💊 Доктор может воскресить мёртвого игрока!
                  </p>
                )}
              </div>

              {/* Цель — для врача доступны ВСЕ игроки (и живые, и мёртвые) */}
              <div>
                <label className="block text-[10px] sm:text-[11px] text-slate-400 mb-1">
                  На кого?
                  {actionType === 'heal' && <span className="text-green-400 ml-1">(можно воскресить!)</span>}
                </label>
                <select value={targetId} onChange={e=>setTargetId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2.5 focus:outline-none focus:border-pink-500 text-sm">
                  <option value="">— Выбрать —</option>
                  
                  {actionType === 'heal' ? (
                    <>
                      <optgroup label="💀 Мёртвые (ВОСКРЕСТИТЬ!)">
                        {players.filter(x=>x.status==='dead').map(p=><option key={p.id} value={p.id}>💀 {p.name}</option>)}
                      </optgroup>
                      <optgroup label="💚 Живые (лечить)"> 
                        {players.filter(x=>x.status==='alive').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                      </optgroup>
                    </>
                  ) : (
                    players.filter(x=>x.status==='alive'&&!(actionType==='block'&&x.actionStatus==='blocked'))
                      .map(p=><option key={p.id} value={p.id}>{p.name}{p.actionStatus==='blocked'?' 💋':''}</option>)
                  )}
                </select>
              </div>

              <button onClick={addAction} disabled={!actorId||!targetId}
                className="w-full py-2.5 sm:py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-35 disabled:cursor-not-allowed rounded-xl font-bold text-sm transition active:scale-[0.99]">
                ✓ Записать ({roundType==='night'?'Ночь':'День'} {roundNum})
              </button>
            </div>
          </section>


          {/* ==== ИСТОРИЯ ==== */}
          <section className="bg-slate-800/60 rounded-xl sm:rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 sm:py-3 bg-slate-800/80 border-b border-slate-700/50">
              <h3 className="font-semibold text-sm">📜 Ход игры</h3>
              {events.length>0&&<button onClick={()=>setEvents([])} className="text-[10px] text-slate-500 hover:text-white transition">очистить</button>}
            </div>
            
            <div className="max-h-[320px] sm:max-h-[400px] overflow-y-auto">
              {events.length===0?(
                <p className="p-6 sm:p-8 text-center text-slate-600 text-sm">Нет событий</p>
              ):(
                <div className="divide-y divide-slate-700/15">
                  {[...events].reverse().map(ev=>{
                    const target = getPlayer(ev.targetId);
                    const logPrefix = LOG_TEMPLATES[ev.type](ev.actorRole);
                    
                    return (
                      <div key={ev.id} className="px-4 py-2.5 sm:py-3 group text-sm">
                        <div className="flex items-start gap-2 sm:gap-3">
                          <span className={`shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-sm sm:text-base mt-0.5 ${ACTIONS[ev.type].bgColor.split(' ')[0]} border border-transparent`}>
                            {ACTIONS[ev.type].emoji}
                          </span>
                          
                          <div className="flex-1 min-w-0 leading-snug">
                            <div>
                              <span className="font-medium">{logPrefix}</span>{' '}
                              <span className={`font-bold ${LOG_COLORS[ev.type]}`}>"{target?.name??'?'}"</span>
                              {ev.type === 'heal' && target && target.status === 'alive' && (
                                <span className="ml-1 text-yellow-300 text-xs">(✨ воскрешён!)</span>
                              )}
                            </div>
                            <div className="text-[10px] sm:text-xs text-slate-600 mt-0.5">
                              {ev.roundType==='night'?'🌙':'☀️'} {ev.roundType==='night'?'Ночь':'День'} {ev.roundNumber}
                            </div>
                          </div>

                          <button 
                            onClick={() => removeAction(ev.id)}
                            className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-600 hover:text-red-400 transition text-xs self-start p-1"
                          >✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>


          {/* ==== СТАТИСТИКА ==== */}
          <section className="lg:col-span-2 bg-slate-800/60 rounded-xl sm:rounded-2xl border border-slate-700/50 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h3 className="text-xs sm:text-sm font-bold text-slate-400">📊</h3>
              <div className="text-xs text-slate-500">
                💚{alive.length} · 💀{dead.length}
              </div>
            </div>
            
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 sm:gap-2">
              <MiniStat icon="🔪" val={alive.filter(x=>x.role==='mafia').length} label="Мафия"/>
              <MiniStat icon="🤡" val={alive.filter(x=>x.role==='maniac').length} label="Маньяк"/>
              <MiniStat icon="⭐" val={alive.filter(x=>x.role==='sheriff').length} label="Шериф"/>
              <MiniStat icon="💉" val={alive.filter(x=>x.role==='doctor').length} label="Доктор"/>
              <MiniStat icon="💋" val={alive.filter(x=>x.role==='lover').length} label="Люб."/>
              <MiniStat icon="👤" val={alive.filter(x=>x.role==='civilian').length} label="Мирн."/>
            </div>

            {/* Шерифы со смертельной проверкой */}
            {sheriffsWhoCanCheck.length > 0 && (
              <div className="mt-2.5 pt-2.5 border-t border-blue-800/30">
                <div className="text-xs text-blue-400 mb-1 flex items-center gap-1">
                  <span>⭐ Шериф(и) могут проверить:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sheriffsWhoCanCheck.map(p => (
                    <span key={p.id} className="text-xs text-blue-200 bg-blue-900/30 px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                      {p.name} <span className="text-[9px]">1×</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {alive.some(x=>x.actionStatus==='blocked')&&(
              <div className="mt-2.5 sm:mt-3 pt-2.5 sm:pt-3 border-t border-slate-700">
                <div className="text-xs text-pink-400 mb-1 flex items-center justify-between">
                  <span>💋 Заблокированы:</span>
                  <button onClick={unblockAll} className="text-[10px] text-pink-300/70 hover:text-pink-200 transition">разблок.</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {alive.filter(x=>x.actionStatus==='blocked').map(p=>(
                    <span key={p.id} className="text-xs text-pink-200/70 bg-pink-900/30 px-2 py-0.5 rounded-full">{p.name}</span>
                  ))}
                </div>
              </div>
            )}
          </section>

        </div>
      </main>

      {/* МОДАЛКА РОЛЕЙ */}
      {showRoleModal && (
        <RoleAssignModal
          players={players}
          focusId={typeof showRoleModal==='string' ? showRoleModal : undefined}
          onClose={()=>setShowRoleModal(false)}
          onRoleChange={changeRole}
        />
      )}

    </div>
  );
}


// ==================== КОМПОНЕНТЫ ====================

function MiniStat({ icon, val, label }: { icon: string; val: number; label: string }) {
  return (
    <div className="bg-slate-900/60 rounded-lg py-1.5 px-1.5 text-center">
      <div className="text-base sm:text-lg font-bold">{val}</div>
      <div className="text-[8px] sm:text-[10px] text-slate-500">{icon} {label}</div>
    </div>
  );
}


// ==================== МОДАЛКА РАЗДАЧИ РОЛЕЙ ====================

interface RoleModalProps {
  players: Player[];
  focusId?: string;
  onClose: ()=>void;
  onRoleChange: (id:string, role: RoleType)=>void;
}

function RoleAssignModal({ players, focusId, onClose, onRoleChange }: RoleModalProps) {
  const [selected, setSelected] = useState<string|null>(focusId ?? null);
  const sel = selected ? players.find(x=>x.id===selected) : null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div 
        className="bg-slate-900 w-full sm:max-w-lg max-h-[85vh] sm:max-h-[90vh] overflow-hidden shadow-2xl border-t sm:border sm:border-slate-700/50 sm:rounded-2xl sm:rounded-b-2xl flex flex-col"
        onClick={e=>e.stopPropagation()}
      >
        
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-700/50 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base sm:text-xl font-bold">🎭 Раздача ролей</h2>
            <p className="text-xs sm:text-sm text-slate-400 hidden sm:block">Выберите игрока → выберите роль</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl text-xl transition">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col sm:flex-col">
          
          <div className="p-4 border-b border-slate-700/30 shrink-0">
            <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Игроки</div>
            
            <div className="grid grid-cols-2 sm:flex sm:flex-col gap-1.5 max-h-[180px] sm:max-h-[240px] overflow-y-auto">
              {players.map(player => {
                const r = ROLES[player.role];
                const isSelected = player.id === selected;
                const isDead = player.status === 'dead';
                const sheriffPending = player.role === 'sheriff' && isDead && player.sheriffCheckNight != null;

                return (
                  <button key={player.id} onClick={() => setSelected(player.id)}
                    className={`flex items-center gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-left transition-all ${
                      isSelected ? `ring-2 ${r.color.replace('border-', 'ring-')} bg-slate-800/80 scale-[1.02]` : 'hover:bg-slate-800/40'
                    } ${isDead ? 'opacity-40' : ''}`}>
                    <span className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-base sm:text-lg border shrink-0 ${r.color}`}>{r.emoji}</span>
                    <div className="min-w-0">
                      <div className={`font-semibold text-xs sm:text-sm truncate ${isDead?'line-through':''}`}>{player.name}</div>
                      <div className="text-[10px] text-slate-500">{r.name}{isDead?' 💀':''}{sheriffPending?' ⭐1×':''}</div>
                    </div>
                    {isSelected && <span className="text-green-400 text-xs sm:text-sm ml-auto">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {sel && (
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="text-xs sm:text-sm mb-3">
                <span className="text-slate-400">Для: </span>
                <span className="text-pink-400 font-bold">{sel.name}</span>
                {sel.role === 'sheriff' && sel.sheriffCheckNight != null && sel.status === 'dead' && (
                  <span className="ml-2 text-blue-400 text-xs bg-blue-900/30 px-1.5 py-0.5 rounded-full">⭐ Есть 1 проверка!</span>
                )}
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
                {(Object.entries(ROLES) as [RoleType, typeof ROLES[RoleType]][]).map(([key, info]) => {
                  const isActive = sel.role === key;
                  return (
                    <button key={key} onClick={() => { onRoleChange(sel.id, key); }}
                      className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all text-center active:scale-[0.95] ${
                        isActive ? `${info.color} border-white/60 scale-105 shadow-lg` : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
                      }`}>
                      <div className="text-xl sm:text-2xl mb-1">{info.emoji}</div>
                      <div className={`text-[11px] sm:text-xs font-bold ${isActive?'':'text-slate-300'}`}>{info.name}</div>
                      <div className={`text-[8px] sm:text-[9px] mt-0.5 ${isActive?'opacity-80':'text-slate-500'}`}>
                        {info.team==='black'?'🖤':info.team==='neutral'?'⚪':'❤️'}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 sm:mt-4 p-2.5 sm:p-3 bg-slate-800/50 rounded-xl text-xs sm:text-sm text-slate-300">
                <strong className="text-sm">{ROLES[sel.role].emoji} {ROLES[sel.role].name}</strong>
                {' — '}{ROLES[sel.role].description}
                {sel.role === 'sheriff' && (
                  <p className="text-blue-400/80 text-[10px] sm:text-xs mt-1">
                    ⚡ 1 проверка — только в ночь смерти! Больше никогда!
                  </p>
                )}
                {sel.role === 'doctor' && (
                  <p className="text-green-400/80 text-[10px] sm:text-xs mt-1">
                    💊 Может воскресить мёртвых!
                  </p>
                )}
                {sel.role === 'lover' && (
                  <p className="text-pink-400/80 text-[10px] sm:text-xs mt-1">
                    💕 Блокирует до конца раунда!
                  </p>
                )}
              </div>
            </div>
          )}

          {!sel && (
            <div className="flex-1 flex items-center justify-center p-8 text-slate-500 text-sm">
              ↑ Нажмите на игрока ↑
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
