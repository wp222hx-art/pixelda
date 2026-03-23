import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  ElementRef,
  ViewChild,
  AfterViewInit,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { GenerationService } from '../../services/generation.service';
import { SettingsService } from '../../services/settings.service';
import { firstValueFrom } from 'rxjs';
import Phaser from 'phaser';

// ============================================================
// Types — SYNAPSE Parallel World with AI Learning
// ============================================================

type AIBehavior =
  | 'wanderer'
  | 'guardian'
  | 'merchant'
  | 'wildlife'
  | 'predator'
  | 'social'
  | 'scenery';

/** Personality trait dimensions — evolve over time */
interface PersonalityTraits {
  curiosity: number;      // 0-100: affects exploration range
  aggression: number;     // 0-100: affects combat / flee threshold
  sociability: number;    // 0-100: affects seeking others
  wisdom: number;         // 0-100: affects decision quality
  courage: number;        // 0-100: affects facing danger
}

/** Skills an agent can learn through experience */
interface AgentSkills {
  combat: number;         // fighting ability 0-100
  foraging: number;       // finding items 0-100
  negotiation: number;    // trading effectiveness 0-100
  stealth: number;        // avoiding detection 0-100
  leadership: number;     // influencing others 0-100
  crafting: number;       // creating items 0-100
}

/** A single memory entry */
interface AgentMemory {
  time: number;           // world clock when it happened
  type: 'encounter' | 'trade' | 'fight' | 'discovery' | 'lesson' | 'gift' | 'flee';
  targetId: string | null;
  targetName: string;
  description: string;
  emotional: 'positive' | 'neutral' | 'negative';
  skillGained?: keyof AgentSkills;
  xpGained?: number;
}

/** Relationship between two agents */
interface AgentRelationship {
  targetId: string;
  targetName: string;
  type: 'stranger' | 'acquaintance' | 'friend' | 'rival' | 'mentor' | 'ally';
  affinity: number;       // -100 (hostile) to +100 (devoted)
  interactions: number;   // count of interactions
  lastInteraction: number; // world clock
}

interface PlaygroundAsset {
  id: string;
  name: string;
  type: 'character' | 'background' | 'prop';
  imageUrl: string;
  loaded: boolean;
}

interface PlacedSprite {
  id: string;
  assetId: string;
  x: number;
  y: number;
  scale: number;
  flipX: boolean;
  behavior: AIBehavior;
  speed: number;
  interactionRadius: number;
  displayName: string;
  // --- Agent empowerment fields ---
  level: number;
  xp: number;
  xpToNext: number;
  personality: PersonalityTraits;
  skills: AgentSkills;
}

/** Runtime AI state per entity */
interface AIState {
  spriteId: string;
  vx: number;
  vy: number;
  stateTimer: number;
  subState: 'idle' | 'moving' | 'fleeing' | 'chasing' | 'talking' | 'learning' | 'trading' | 'exploring';
  targetId: string | null;
  homeX: number;
  homeY: number;
  patrolRadius: number;
  talkTimer: number;
  talkText: string;
  // --- Learning & memory ---
  memories: AgentMemory[];
  relationships: AgentRelationship[];
  learnCooldown: number;       // seconds until next skill gain opportunity
  interactionCooldown: number; // prevents spam interactions
  discoveryCount: number;      // how many things this agent has discovered
  totalXpEarned: number;
}

interface WorldEvent {
  time: number;
  text: string;
  icon: string;
  category?: 'system' | 'social' | 'combat' | 'learning' | 'discovery' | 'trade';
}

interface WorldBuilderEntity {
  name: string;
  hint: string;
  behavior: AIBehavior;
  motionHint: string;
}

interface PipelineLogEntry {
  step: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail: string;
  url?: string;
}

// ============================================================
// Dialogue / thought bank with learning-aware lines
// ============================================================
const THOUGHTS_EN: Record<AIBehavior, string[]> = {
  wanderer: ['Where shall I go next...', 'The wind is nice today.', 'I wonder what\'s over there.', 'Just passing through.', 'Hmm, this place looks familiar.', 'I feel like I\'m getting better at this.', 'Every journey teaches something new.'],
  guardian: ['All clear.', 'Halt! Who goes there?', 'Nothing gets past me.', 'Perimeter secure.', 'Stay sharp.', 'My combat skills grow stronger.', 'I\'ve learned to sense danger.'],
  merchant: ['Come see my wares!', 'Best prices in town!', 'Special deal, just for you!', 'Freshly restocked!', 'Looking to trade?', 'My negotiation skills have improved!', 'I\'ve learned what people want.'],
  wildlife: ['...', '*sniff sniff*', '*ears twitch*', '*looks around nervously*', '*grazes quietly*', '*senses sharpen*', '*instincts growing*'],
  predator: ['*growls*', 'I smell prey...', '*eyes glow*', '*prowling*', 'Hungry...', '*hunts with more cunning*', '*has learned new tactics*'],
  social: ['Hey, how are you?', 'Nice weather!', 'Did you hear the news?', 'Let\'s chat!', 'Good to see you!', 'I\'ve made so many friends!', 'Relationships are everything.'],
  scenery: [],
};
const THOUGHTS_ZH: Record<AIBehavior, string[]> = {
  wanderer: ['接下来去哪呢...', '今天的风很舒服', '那边有什么？', '路过看看', '这地方好像来过', '感觉自己越来越厉害了', '每段旅程都有新收获'],
  guardian: ['一切正常', '站住！何人？', '谁也别想通过', '周边安全', '保持警惕', '我的战斗技能更强了', '我学会了感知危险'],
  merchant: ['来看看我的货物！', '全城最低价！', '给你特别折扣！', '刚刚补货！', '想交易吗？', '我的谈判技巧提高了！', '我学会了人们想要什么'],
  wildlife: ['...', '*嗅嗅*', '*耳朵抖动*', '*紧张地四处张望*', '*安静地吃草*', '*感官在变强*', '*本能在进化*'],
  predator: ['*低吼*', '我闻到猎物了...', '*眼睛发光*', '*潜行中*', '好饿...', '*猎杀更加狡猾*', '*学到了新战术*'],
  social: ['嘿，你好啊！', '天气不错！', '你听说了吗？', '来聊聊！', '好久不见！', '我交了好多朋友！', '关系就是一切'],
  scenery: [],
};

// Learning-specific thought lines
const LEARNING_THOUGHTS_EN: Record<string, string[]> = {
  levelUp: ['I feel stronger!', 'Level up! New horizons await.', 'Growing wiser every day.', 'I can feel the power!'],
  skillGain: ['I learned something new!', 'Practice makes perfect.', 'My skills improve!', 'Knowledge is power.'],
  newRelation: ['We could be friends!', 'An interesting character...', 'I sense a connection.', 'Shall we get to know each other?'],
  discovery: ['What\'s this?', 'I found something!', 'A hidden treasure!', 'The world has secrets...'],
  mentoring: ['Let me teach you.', 'Sharing is caring.', 'Pass on the knowledge.', 'Learn from my experience.'],
};
const LEARNING_THOUGHTS_ZH: Record<string, string[]> = {
  levelUp: ['我变强了！', '升级了！新的视野等着我。', '每天都在变得更聪明。', '我能感受到力量！'],
  skillGain: ['我学到了新东西！', '熟能生巧。', '技能提升了！', '知识就是力量。'],
  newRelation: ['我们可以成为朋友！', '有趣的角色...', '我感受到了联系。', '要不要互相认识一下？'],
  discovery: ['这是什么？', '我发现了什么！', '隐藏的宝藏！', '世界有它的秘密...'],
  mentoring: ['让我教你。', '分享是关爱。', '传递知识。', '从我的经验中学习。'],
};

// ============================================================
// Skill names and trait names for display
// ============================================================
const SKILL_NAMES_EN: Record<keyof AgentSkills, string> = {
  combat: 'Combat', foraging: 'Foraging', negotiation: 'Negotiation',
  stealth: 'Stealth', leadership: 'Leadership', crafting: 'Crafting',
};
const SKILL_NAMES_ZH: Record<keyof AgentSkills, string> = {
  combat: '战斗', foraging: '采集', negotiation: '谈判',
  stealth: '潜行', leadership: '领导力', crafting: '工艺',
};
const TRAIT_NAMES_EN: Record<keyof PersonalityTraits, string> = {
  curiosity: 'Curiosity', aggression: 'Aggression', sociability: 'Sociability',
  wisdom: 'Wisdom', courage: 'Courage',
};
const TRAIT_NAMES_ZH: Record<keyof PersonalityTraits, string> = {
  curiosity: '好奇心', aggression: '攻击性', sociability: '社交性',
  wisdom: '智慧', courage: '勇气',
};

// ============================================================
// Helper: Generate random personality and skills
// ============================================================
function generatePersonality(behavior: AIBehavior): PersonalityTraits {
  const base: PersonalityTraits = { curiosity: 50, aggression: 30, sociability: 50, wisdom: 30, courage: 50 };
  switch (behavior) {
    case 'wanderer':  return { ...base, curiosity: 70 + r(20), courage: 60 + r(20), sociability: 40 + r(20) };
    case 'guardian':  return { ...base, courage: 80 + r(15), aggression: 50 + r(20), wisdom: 50 + r(20) };
    case 'merchant':  return { ...base, sociability: 70 + r(20), wisdom: 60 + r(20), curiosity: 40 + r(20) };
    case 'wildlife':  return { ...base, curiosity: 40 + r(30), courage: 20 + r(20), aggression: 10 + r(15) };
    case 'predator':  return { ...base, aggression: 70 + r(25), courage: 70 + r(20), curiosity: 30 + r(20) };
    case 'social':    return { ...base, sociability: 80 + r(15), wisdom: 40 + r(20), curiosity: 50 + r(20) };
    default:          return base;
  }
}

function generateSkills(behavior: AIBehavior): AgentSkills {
  const base: AgentSkills = { combat: 5, foraging: 5, negotiation: 5, stealth: 5, leadership: 5, crafting: 5 };
  switch (behavior) {
    case 'wanderer':  return { ...base, foraging: 15 + r(10), stealth: 10 + r(10) };
    case 'guardian':  return { ...base, combat: 20 + r(15), leadership: 10 + r(10) };
    case 'merchant':  return { ...base, negotiation: 25 + r(10), crafting: 10 + r(10) };
    case 'wildlife':  return { ...base, stealth: 15 + r(10), foraging: 20 + r(10) };
    case 'predator':  return { ...base, combat: 25 + r(15), stealth: 15 + r(10) };
    case 'social':    return { ...base, leadership: 15 + r(10), negotiation: 10 + r(10) };
    default:          return base;
  }
}

function r(max: number): number { return Math.floor(Math.random() * max); }

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function xpForLevel(level: number): number {
  return Math.floor(50 * Math.pow(1.3, level - 1));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// Phaser Scene — AI-Driven World with Learning
// ============================================================

class ParallelWorldScene extends Phaser.Scene {
  private spriteMap: Map<string, Phaser.GameObjects.Image> = new Map();
  private dataMap: Map<string, PlacedSprite> = new Map();
  private aiMap: Map<string, AIState> = new Map();
  private bubbleMap: Map<string, Phaser.GameObjects.Text> = new Map();
  private nameTagMap: Map<string, Phaser.GameObjects.Text> = new Map();
  private levelBadgeMap: Map<string, Phaser.GameObjects.Text> = new Map();

  private gridGraphics!: Phaser.GameObjects.Graphics;
  private showGrid = true;
  private bgImage: Phaser.GameObjects.Image | null = null;

  private _isObserving = false;
  private _worldClock = 0;
  private _timeScale = 1;
  private _focusId: string | null = null;

  private clockText: Phaser.GameObjects.Text | null = null;
  private dragTarget: Phaser.GameObjects.Image | null = null;

  // Callbacks to Angular
  public onSpriteSelected: ((id: string | null) => void) | null = null;
  public onSpritePositionChanged: ((id: string, x: number, y: number) => void) | null = null;
  public onWorldStateChanged: ((observing: boolean, clock: number) => void) | null = null;
  public onWorldEvent: ((evt: WorldEvent) => void) | null = null;
  public onAgentLevelUp: ((spriteId: string, newLevel: number) => void) | null = null;
  public onAgentSkillGain: ((spriteId: string, skill: string, newValue: number) => void) | null = null;
  public onAgentMemoryAdded: ((spriteId: string, memory: AgentMemory) => void) | null = null;
  public onAgentRelationshipChanged: ((spriteId: string, rel: AgentRelationship) => void) | null = null;
  public lang: 'en' | 'zh' = 'en';

  constructor() { super({ key: 'ParallelWorldScene' }); }

  get isObserving() { return this._isObserving; }
  get worldClock() { return this._worldClock; }
  get timeScale() { return this._timeScale; }
  set timeScale(v: number) { this._timeScale = Phaser.Math.Clamp(v, 0.25, 3); }

  getAIState(spriteId: string): AIState | undefined { return this.aiMap.get(spriteId); }

  preload() {}

  create() {
    this.gridGraphics = this.add.graphics();
    this.drawGrid();
    this.cameras.main.setBackgroundColor('#1a1a2e');

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this._isObserving) return;
      const hits = this.input.hitTestPointer(p);
      if (hits.length > 0) {
        const top = hits[hits.length - 1] as Phaser.GameObjects.Image;
        const sid = top.getData('spriteId') as string | undefined;
        if (sid) {
          this._focusId = sid;
          if (this.onSpriteSelected) this.onSpriteSelected(sid);
        }
      }
    });
  }

  override update(_time: number, _delta: number) {
    if (!this._isObserving) return;

    const dt = (_delta / 1000) * this._timeScale;
    this._worldClock += dt;

    const w = Number(this.game.config.width);
    const h = Number(this.game.config.height);

    this.aiMap.forEach((ai, sid) => {
      const sprite = this.spriteMap.get(sid);
      const data = this.dataMap.get(sid);
      if (!sprite || !data || data.behavior === 'scenery') return;

      ai.stateTimer -= dt;
      if (ai.talkTimer > 0) {
        ai.talkTimer -= dt;
        if (ai.talkTimer <= 0) this.hideBubble(sid);
      }
      if (ai.learnCooldown > 0) ai.learnCooldown -= dt;
      if (ai.interactionCooldown > 0) ai.interactionCooldown -= dt;

      // Behavior tick
      switch (data.behavior) {
        case 'wanderer':  this.tickWanderer(ai, sprite, data, dt, w, h); break;
        case 'guardian':   this.tickGuardian(ai, sprite, data, dt, w, h); break;
        case 'merchant':   this.tickMerchant(ai, sprite, data, dt); break;
        case 'wildlife':   this.tickWildlife(ai, sprite, data, dt, w, h); break;
        case 'predator':   this.tickPredator(ai, sprite, data, dt, w, h); break;
        case 'social':     this.tickSocial(ai, sprite, data, dt, w, h); break;
      }

      // Learning tick — passive skill gains, discoveries
      this.tickLearning(ai, sprite, data, dt, w, h);

      // Update sprite position
      sprite.x = Phaser.Math.Clamp(sprite.x + ai.vx * dt, 16, w - 16);
      sprite.y = Phaser.Math.Clamp(sprite.y + ai.vy * dt, 16, h - 16);
      data.x = Math.round(sprite.x);
      data.y = Math.round(sprite.y);
      if (ai.vx < -1) sprite.setFlipX(true);
      if (ai.vx > 1) sprite.setFlipX(false);

      // Update bubble + name tag + level badge positions
      const bubble = this.bubbleMap.get(sid);
      if (bubble) {
        bubble.x = sprite.x;
        bubble.y = sprite.y - sprite.displayHeight * 0.5 - 28;
      }
      const nameTag = this.nameTagMap.get(sid);
      if (nameTag) {
        nameTag.x = sprite.x;
        nameTag.y = sprite.y - sprite.displayHeight * 0.5 - 12;
      }
      const lvBadge = this.levelBadgeMap.get(sid);
      if (lvBadge) {
        lvBadge.x = sprite.x + sprite.displayWidth * 0.5 - 4;
        lvBadge.y = sprite.y - sprite.displayHeight * 0.5 - 4;
        lvBadge.setText(`Lv${data.level}`);
      }
    });

    // Camera follow
    if (this._focusId) {
      const fs = this.spriteMap.get(this._focusId);
      if (fs) {
        this.cameras.main.centerOn(
          Phaser.Math.Linear(this.cameras.main.midPoint.x, fs.x, 0.05),
          Phaser.Math.Linear(this.cameras.main.midPoint.y, fs.y, 0.05),
        );
      }
    }

    this.updateClock();
    if (this.onWorldStateChanged) this.onWorldStateChanged(true, this._worldClock);
  }

  // ============================================================
  // LEARNING TICK — the core of agent empowerment
  // ============================================================

  private tickLearning(ai: AIState, sprite: Phaser.GameObjects.Image, data: PlacedSprite, dt: number, w: number, h: number) {
    if (ai.learnCooldown > 0) return;

    // --- Passive learning: gain XP from existing behavior ---
    const baseXpRate = 0.3 + (data.personality.wisdom / 200); // wisdom boosts XP gain
    const xpGain = baseXpRate * dt;

    // Behavior-specific skill gains
    let primarySkill: keyof AgentSkills | null = null;
    switch (data.behavior) {
      case 'wanderer':  primarySkill = 'foraging'; break;
      case 'guardian':  primarySkill = 'combat'; break;
      case 'merchant':  primarySkill = 'negotiation'; break;
      case 'predator':  primarySkill = 'combat'; break;
      case 'social':    primarySkill = 'leadership'; break;
      case 'wildlife':  primarySkill = 'stealth'; break;
    }

    // Slow passive skill gain
    if (primarySkill && Math.random() < 0.005 * dt * this._timeScale) {
      const gain = 0.1 + (data.personality.curiosity / 500);
      data.skills[primarySkill] = clamp(data.skills[primarySkill] + gain, 0, 100);
      if (this.onAgentSkillGain) {
        this.onAgentSkillGain(ai.spriteId, primarySkill, data.skills[primarySkill]);
      }
    }

    // --- Proximity-based interaction learning ---
    if (ai.interactionCooldown <= 0) {
      this.checkLearningInteractions(ai, sprite, data, w, h);
    }

    // --- Discovery system ---
    if (Math.random() < 0.002 * dt * (data.personality.curiosity / 50)) {
      this.triggerDiscovery(ai, data);
    }

    // --- XP accumulation and level-up check ---
    data.xp += xpGain;
    if (data.xp >= data.xpToNext) {
      this.levelUpAgent(ai, data);
    }
  }

  /** Check for nearby agents and trigger learning interactions */
  private checkLearningInteractions(ai: AIState, sprite: Phaser.GameObjects.Image, data: PlacedSprite, w: number, h: number) {
    const interactRange = data.interactionRadius * (1 + data.personality.sociability / 200);

    this.spriteMap.forEach((other, otherId) => {
      if (otherId === ai.spriteId) return;
      const otherData = this.dataMap.get(otherId);
      const otherAi = this.aiMap.get(otherId);
      if (!otherData || !otherAi || otherData.behavior === 'scenery') return;

      const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, other.x, other.y);
      if (dist > interactRange) return;

      // Already on cooldown for this pair
      if (ai.interactionCooldown > 0) return;

      // --- Update relationship ---
      let rel = ai.relationships.find(r => r.targetId === otherId);
      if (!rel) {
        rel = {
          targetId: otherId,
          targetName: otherData.displayName,
          type: 'stranger',
          affinity: 0,
          interactions: 0,
          lastInteraction: this._worldClock,
        };
        ai.relationships.push(rel);
        this.emitEvent(
          this.lang === 'zh'
            ? `${data.displayName} 遇到了 ${otherData.displayName}`
            : `${data.displayName} met ${otherData.displayName}`,
          '👋', 'social'
        );
      }

      rel.interactions++;
      rel.lastInteraction = this._worldClock;

      // Determine interaction type based on behaviors
      let interactionType: AgentMemory['type'] = 'encounter';
      let skillGained: keyof AgentSkills | undefined;
      let xpEarned = 2 + Math.random() * 3;
      let affinityDelta = 1;
      let emotional: AgentMemory['emotional'] = 'neutral';

      // Social + Social = friendship + leadership gain
      if (data.behavior === 'social' || otherData.behavior === 'social') {
        interactionType = 'encounter';
        skillGained = 'leadership';
        xpEarned = 3 + Math.random() * 4;
        affinityDelta = 2 + Math.random() * 3;
        emotional = 'positive';
      }

      // Merchant interaction = trade + negotiation gain
      if (data.behavior === 'merchant' || otherData.behavior === 'merchant') {
        interactionType = 'trade';
        skillGained = 'negotiation';
        xpEarned = 4 + Math.random() * 3;
        affinityDelta = 1 + Math.random() * 2;
        emotional = 'positive';

        this.emitEvent(
          this.lang === 'zh'
            ? `${data.displayName} 和 ${otherData.displayName} 进行了交易`
            : `${data.displayName} traded with ${otherData.displayName}`,
          '💰', 'trade'
        );
      }

      // Predator vs Wildlife = combat + fight
      if ((data.behavior === 'predator' && otherData.behavior === 'wildlife') ||
          (data.behavior === 'wildlife' && otherData.behavior === 'predator')) {
        interactionType = 'fight';
        skillGained = data.behavior === 'predator' ? 'combat' : 'stealth';
        xpEarned = 5 + Math.random() * 5;
        affinityDelta = -(3 + Math.random() * 5);
        emotional = 'negative';
      }

      // Guardian interaction = mentor relationship possible
      if (data.behavior === 'guardian' && otherData.level < data.level) {
        interactionType = 'lesson';
        skillGained = 'combat';
        xpEarned = 3 + Math.random() * 4;
        affinityDelta = 3 + Math.random() * 2;
        emotional = 'positive';

        // Guardian mentors lower-level entities
        if (rel.interactions >= 3 && rel.type !== 'mentor') {
          rel.type = 'mentor';
          this.emitEvent(
            this.lang === 'zh'
              ? `${data.displayName} 成为了 ${otherData.displayName} 的导师！`
              : `${data.displayName} became ${otherData.displayName}'s mentor!`,
            '🎓', 'learning'
          );
          this.sayLearningThought(ai.spriteId, data, 'mentoring');
        }
      }

      // Higher-level entity teaches lower one
      if (data.level > otherData.level + 2 && Math.random() < 0.3) {
        interactionType = 'lesson';
        // The higher-level entity gives the other entity XP
        otherData.xp += 2;
        emotional = 'positive';
        this.sayLearningThought(ai.spriteId, data, 'mentoring');
      }

      // Update affinity and evolve relationship type
      rel.affinity = clamp(rel.affinity + affinityDelta, -100, 100);
      this.evolveRelationship(rel);

      // Apply skill gain
      if (skillGained) {
        const gain = 0.2 + (data.personality.wisdom / 300);
        data.skills[skillGained] = clamp(data.skills[skillGained] + gain, 0, 100);
        if (this.onAgentSkillGain) {
          this.onAgentSkillGain(ai.spriteId, skillGained, data.skills[skillGained]);
        }
      }

      // Add XP
      data.xp += xpEarned;
      ai.totalXpEarned += xpEarned;

      // Add memory
      const memory: AgentMemory = {
        time: this._worldClock,
        type: interactionType,
        targetId: otherId,
        targetName: otherData.displayName,
        description: this.generateMemoryDesc(interactionType, data, otherData),
        emotional,
        skillGained,
        xpGained: Math.round(xpEarned),
      };
      ai.memories.push(memory);
      if (ai.memories.length > 50) ai.memories.shift(); // Keep last 50
      if (this.onAgentMemoryAdded) this.onAgentMemoryAdded(ai.spriteId, memory);

      // Set interaction cooldown (prevent spam)
      ai.interactionCooldown = 5 + Math.random() * 5;

      // Notify relationship change
      if (this.onAgentRelationshipChanged) {
        this.onAgentRelationshipChanged(ai.spriteId, rel);
      }
    });
  }

  /** Evolve relationship type based on affinity and interaction count */
  private evolveRelationship(rel: AgentRelationship) {
    if (rel.affinity >= 60 && rel.interactions >= 5) rel.type = 'ally';
    else if (rel.affinity >= 30 && rel.interactions >= 3) rel.type = 'friend';
    else if (rel.affinity >= 10 && rel.interactions >= 2) rel.type = 'acquaintance';
    else if (rel.affinity <= -30) rel.type = 'rival';
    // mentor type is set explicitly, don't override
  }

  /** Trigger a random discovery */
  private triggerDiscovery(ai: AIState, data: PlacedSprite) {
    ai.discoveryCount++;
    const xpGain = 3 + Math.random() * 5;
    data.xp += xpGain;
    ai.totalXpEarned += xpGain;

    // Discovery improves foraging or crafting
    const skill: keyof AgentSkills = Math.random() < 0.5 ? 'foraging' : 'crafting';
    data.skills[skill] = clamp(data.skills[skill] + 0.3, 0, 100);

    const memory: AgentMemory = {
      time: this._worldClock,
      type: 'discovery',
      targetId: null,
      targetName: '',
      description: this.lang === 'zh'
        ? `${data.displayName} 在 (${data.x}, ${data.y}) 发现了新事物`
        : `${data.displayName} discovered something new at (${data.x}, ${data.y})`,
      emotional: 'positive',
      skillGained: skill,
      xpGained: Math.round(xpGain),
    };
    ai.memories.push(memory);
    if (ai.memories.length > 50) ai.memories.shift();

    this.emitEvent(
      this.lang === 'zh'
        ? `${data.displayName} 发现了什么！(第 ${ai.discoveryCount} 次发现)`
        : `${data.displayName} made a discovery! (#${ai.discoveryCount})`,
      '🔍', 'discovery'
    );

    this.sayLearningThought(ai.spriteId, data, 'discovery');
    ai.learnCooldown = 8 + Math.random() * 10;
  }

  /** Level up an agent */
  private levelUpAgent(ai: AIState, data: PlacedSprite) {
    data.level++;
    data.xp -= data.xpToNext;
    data.xpToNext = xpForLevel(data.level);

    // Personality evolves slightly on level up
    const traitKeys = Object.keys(data.personality) as (keyof PersonalityTraits)[];
    const trait = pickRandom(traitKeys);
    data.personality[trait] = clamp(data.personality[trait] + (1 + Math.random() * 2), 0, 100);

    // Speed increases slightly
    data.speed = Math.min(data.speed + 1, 200);

    this.emitEvent(
      this.lang === 'zh'
        ? `🎉 ${data.displayName} 升级到 Lv${data.level}！`
        : `🎉 ${data.displayName} leveled up to Lv${data.level}!`,
      '⬆️', 'learning'
    );

    this.sayLearningThought(ai.spriteId, data, 'levelUp');

    if (this.onAgentLevelUp) this.onAgentLevelUp(ai.spriteId, data.level);

    // Add level-up memory
    ai.memories.push({
      time: this._worldClock,
      type: 'lesson',
      targetId: null,
      targetName: '',
      description: this.lang === 'zh'
        ? `升级到 Lv${data.level}`
        : `Leveled up to Lv${data.level}`,
      emotional: 'positive',
      xpGained: 0,
    });
  }

  private generateMemoryDesc(type: AgentMemory['type'], self: PlacedSprite, other: PlacedSprite): string {
    const zh = this.lang === 'zh';
    switch (type) {
      case 'encounter': return zh ? `与 ${other.displayName} 相遇` : `Encountered ${other.displayName}`;
      case 'trade': return zh ? `与 ${other.displayName} 交易` : `Traded with ${other.displayName}`;
      case 'fight': return zh ? `与 ${other.displayName} 战斗` : `Fought with ${other.displayName}`;
      case 'lesson': return zh ? `向/从 ${other.displayName} 学习` : `Learned with ${other.displayName}`;
      case 'gift': return zh ? `收到 ${other.displayName} 的礼物` : `Received gift from ${other.displayName}`;
      case 'flee': return zh ? `逃离 ${other.displayName}` : `Fled from ${other.displayName}`;
      default: return zh ? `与 ${other.displayName} 互动` : `Interacted with ${other.displayName}`;
    }
  }

  private sayLearningThought(spriteId: string, data: PlacedSprite, category: string) {
    const bank = this.lang === 'zh' ? LEARNING_THOUGHTS_ZH : LEARNING_THOUGHTS_EN;
    const lines = bank[category];
    if (!lines || lines.length === 0) return;
    const text = pickRandom(lines);
    this.showBubble(spriteId, text);
    const ai = this.aiMap.get(spriteId);
    if (ai) { ai.talkTimer = 3; ai.talkText = text; }
  }

  // ============================================================
  // AI behavior ticks (same structure, enhanced with personality)
  // ============================================================

  private tickWanderer(ai: AIState, sprite: Phaser.GameObjects.Image, data: PlacedSprite, _dt: number, w: number, h: number) {
    if (ai.stateTimer <= 0) {
      const curiosityMod = data.personality.curiosity / 100;
      if (ai.subState === 'idle') {
        const angle = Math.random() * Math.PI * 2;
        ai.vx = Math.cos(angle) * data.speed * (0.8 + curiosityMod * 0.4);
        ai.vy = Math.sin(angle) * data.speed * (0.8 + curiosityMod * 0.4);
        ai.subState = Math.random() < curiosityMod * 0.3 ? 'exploring' : 'moving';
        ai.stateTimer = 1.5 + Math.random() * 3;
      } else {
        ai.vx = 0; ai.vy = 0;
        ai.subState = 'idle';
        ai.stateTimer = 1 + Math.random() * 4;
        if (Math.random() < 0.25) this.sayThought(ai.spriteId, data);
      }
    }
  }

  private tickGuardian(ai: AIState, sprite: Phaser.GameObjects.Image, data: PlacedSprite, _dt: number, w: number, h: number) {
    const dx = ai.homeX - sprite.x;
    const dy = ai.homeY - sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const courageMod = data.personality.courage / 100;

    if (ai.stateTimer <= 0) {
      if (ai.subState === 'idle') {
        const angle = Math.random() * Math.PI * 2;
        const radius = ai.patrolRadius * (0.8 + courageMod * 0.4);
        const r2 = Math.random() * radius;
        const tx = ai.homeX + Math.cos(angle) * r2;
        const ty = ai.homeY + Math.sin(angle) * r2;
        const tdx = tx - sprite.x;
        const tdy = ty - sprite.y;
        const len = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        ai.vx = (tdx / len) * data.speed * 0.6;
        ai.vy = (tdy / len) * data.speed * 0.6;
        ai.subState = 'moving';
        ai.stateTimer = 1.5 + Math.random() * 2;
      } else {
        ai.vx = 0; ai.vy = 0;
        ai.subState = 'idle';
        ai.stateTimer = 2 + Math.random() * 3;
        if (Math.random() < 0.3) this.sayThought(ai.spriteId, data);
      }
    }

    if (dist > ai.patrolRadius * 1.5) {
      ai.vx = (dx / dist) * data.speed;
      ai.vy = (dy / dist) * data.speed;
    }
  }

  private tickMerchant(ai: AIState, sprite: Phaser.GameObjects.Image, data: PlacedSprite, _dt: number) {
    ai.vx = 0; ai.vy = 0;
    if (ai.stateTimer <= 0) {
      ai.stateTimer = 4 + Math.random() * 6;
      if (Math.random() < 0.5) this.sayThought(ai.spriteId, data);
    }
  }

  private tickWildlife(ai: AIState, sprite: Phaser.GameObjects.Image, data: PlacedSprite, _dt: number, w: number, h: number) {
    let threat: Phaser.GameObjects.Image | null = null;
    let minDist = data.interactionRadius;
    const courageMod = data.personality.courage / 100;

    this.spriteMap.forEach((other, otherId) => {
      if (otherId === ai.spriteId) return;
      const od = this.dataMap.get(otherId);
      if (!od || od.behavior === 'wildlife' || od.behavior === 'scenery') return;
      const d = Phaser.Math.Distance.Between(sprite.x, sprite.y, other.x, other.y);
      if (d < minDist) { minDist = d; threat = other; }
    });

    // Higher courage = less likely to flee from non-predators
    if (threat) {
      const threatData = this.dataMap.get((threat as any).getData?.('spriteId'));
      const isPredator = threatData?.behavior === 'predator';
      const fleeChance = isPredator ? 1.0 : (1.0 - courageMod * 0.5);

      if (Math.random() < fleeChance) {
        const t = threat as Phaser.GameObjects.Image;
        const flDx = sprite.x - t.x;
        const flDy = sprite.y - t.y;
        const len = Math.sqrt(flDx * flDx + flDy * flDy) || 1;
        ai.vx = (flDx / len) * data.speed * (1.2 + data.skills.stealth / 200);
        ai.vy = (flDy / len) * data.speed * (1.2 + data.skills.stealth / 200);
        ai.subState = 'fleeing';
        ai.stateTimer = 1;
        return;
      }
    }

    if (ai.stateTimer <= 0) {
      if (ai.subState === 'idle') {
        const angle = Math.random() * Math.PI * 2;
        ai.vx = Math.cos(angle) * data.speed * 0.4;
        ai.vy = Math.sin(angle) * data.speed * 0.4;
        ai.subState = 'moving';
        ai.stateTimer = 1 + Math.random() * 2;
      } else {
        ai.vx = 0; ai.vy = 0;
        ai.subState = 'idle';
        ai.stateTimer = 2 + Math.random() * 5;
        if (Math.random() < 0.15) this.sayThought(ai.spriteId, data);
      }
    }
  }

  private tickPredator(ai: AIState, sprite: Phaser.GameObjects.Image, data: PlacedSprite, _dt: number, w: number, h: number) {
    let prey: Phaser.GameObjects.Image | null = null;
    let minDist = data.interactionRadius * (1 + data.skills.combat / 200);
    this.spriteMap.forEach((other, otherId) => {
      if (otherId === ai.spriteId) return;
      const od = this.dataMap.get(otherId);
      if (!od || od.behavior !== 'wildlife') return;
      const d = Phaser.Math.Distance.Between(sprite.x, sprite.y, other.x, other.y);
      if (d < minDist) { minDist = d; prey = other; }
    });

    if (prey) {
      const p = prey as Phaser.GameObjects.Image;
      const prDx = p.x - sprite.x;
      const prDy = p.y - sprite.y;
      const len = Math.sqrt(prDx * prDx + prDy * prDy) || 1;
      ai.vx = (prDx / len) * data.speed;
      ai.vy = (prDy / len) * data.speed;
      ai.subState = 'chasing';

      if (len < 20) {
        this.emitEvent(this.lang === 'zh'
          ? `${data.displayName} 抓住了猎物！`
          : `${data.displayName} caught its prey!`, '🩸', 'combat');
        ai.vx = 0; ai.vy = 0;
        ai.stateTimer = 3;
        ai.subState = 'idle';
        // Combat XP for successful hunt
        data.xp += 5;
        data.skills.combat = clamp(data.skills.combat + 0.3, 0, 100);
        if (Math.random() < 0.5) this.sayThought(ai.spriteId, data);
      }
      return;
    }

    if (ai.stateTimer <= 0) {
      if (ai.subState === 'idle') {
        const angle = Math.random() * Math.PI * 2;
        ai.vx = Math.cos(angle) * data.speed * 0.5;
        ai.vy = Math.sin(angle) * data.speed * 0.5;
        ai.subState = 'moving';
        ai.stateTimer = 2 + Math.random() * 3;
      } else {
        ai.vx = 0; ai.vy = 0;
        ai.subState = 'idle';
        ai.stateTimer = 2 + Math.random() * 4;
        if (Math.random() < 0.2) this.sayThought(ai.spriteId, data);
      }
    }
  }

  private tickSocial(ai: AIState, sprite: Phaser.GameObjects.Image, data: PlacedSprite, _dt: number, w: number, h: number) {
    let friend: { sprite: Phaser.GameObjects.Image; id: string } | null = null;
    let minDist = data.interactionRadius * (1 + data.personality.sociability / 200);
    this.spriteMap.forEach((other, otherId) => {
      if (otherId === ai.spriteId) return;
      const od = this.dataMap.get(otherId);
      if (!od || (od.behavior !== 'social' && od.behavior !== 'wanderer' && od.behavior !== 'merchant')) return;
      const d = Phaser.Math.Distance.Between(sprite.x, sprite.y, other.x, other.y);
      if (d < minDist) { minDist = d; friend = { sprite: other, id: otherId }; }
    });

    if (friend) {
      const f = friend as { sprite: Phaser.GameObjects.Image; id: string };
      if (minDist < 40) {
        ai.vx = 0; ai.vy = 0;
        if (ai.subState !== 'talking') {
          ai.subState = 'talking';
          ai.stateTimer = 3 + Math.random() * 3;
          this.sayThought(ai.spriteId, data);
          const friendName = this.dataMap.get(f.id)?.displayName || (this.lang === 'zh' ? '某人' : 'someone');
          this.emitEvent(this.lang === 'zh'
            ? `${data.displayName} 开始和 ${friendName} 聊天`
            : `${data.displayName} started chatting with ${friendName}`, '💬', 'social');
        }
        if (ai.stateTimer <= 0) {
          ai.subState = 'idle';
          ai.stateTimer = 2 + Math.random() * 3;
        }
        return;
      }

      const fdx = f.sprite.x - sprite.x;
      const fdy = f.sprite.y - sprite.y;
      const len = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
      ai.vx = (fdx / len) * data.speed * 0.7;
      ai.vy = (fdy / len) * data.speed * 0.7;
      ai.subState = 'moving';
      return;
    }

    if (ai.stateTimer <= 0) {
      if (ai.subState === 'idle') {
        const angle = Math.random() * Math.PI * 2;
        ai.vx = Math.cos(angle) * data.speed * 0.5;
        ai.vy = Math.sin(angle) * data.speed * 0.5;
        ai.subState = 'moving';
        ai.stateTimer = 2 + Math.random() * 3;
      } else {
        ai.vx = 0; ai.vy = 0;
        ai.subState = 'idle';
        ai.stateTimer = 1 + Math.random() * 3;
      }
    }
  }

  // ============================================================
  // Dialogue bubbles
  // ============================================================

  private sayThought(spriteId: string, data: PlacedSprite) {
    const bank = this.lang === 'zh' ? THOUGHTS_ZH : THOUGHTS_EN;
    const lines = bank[data.behavior];
    if (!lines || lines.length === 0) return;
    const text = pickRandom(lines);
    this.showBubble(spriteId, text);
    const ai = this.aiMap.get(spriteId);
    if (ai) { ai.talkTimer = 2.5; ai.talkText = text; }
  }

  private showBubble(spriteId: string, text: string) {
    this.hideBubble(spriteId);
    const sprite = this.spriteMap.get(spriteId);
    if (!sprite) return;
    const bubble = this.add.text(sprite.x, sprite.y - sprite.displayHeight * 0.5 - 28, text, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.75)',
      padding: { x: 5, y: 3 },
      wordWrap: { width: 140 },
    });
    bubble.setOrigin(0.5, 1);
    bubble.setDepth(900);
    this.bubbleMap.set(spriteId, bubble);
  }

  private hideBubble(spriteId: string) {
    const b = this.bubbleMap.get(spriteId);
    if (b) { b.destroy(); this.bubbleMap.delete(spriteId); }
  }

  // ============================================================
  // Name tags and level badges
  // ============================================================

  private showNameTag(spriteId: string) {
    const sprite = this.spriteMap.get(spriteId);
    const data = this.dataMap.get(spriteId);
    if (!sprite || !data) return;

    const tag = this.add.text(sprite.x, sprite.y - sprite.displayHeight * 0.5 - 12,
      data.displayName, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#a8fbd3',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: { x: 3, y: 1 },
      });
    tag.setOrigin(0.5, 1);
    tag.setDepth(850);
    this.nameTagMap.set(spriteId, tag);

    const badge = this.add.text(
      sprite.x + sprite.displayWidth * 0.5 - 4,
      sprite.y - sprite.displayHeight * 0.5 - 4,
      `Lv${data.level}`, {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#f7dc6f',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: { x: 2, y: 1 },
      });
    badge.setOrigin(0.5, 0.5);
    badge.setDepth(851);
    this.levelBadgeMap.set(spriteId, badge);
  }

  private hideNameTag(spriteId: string) {
    const t = this.nameTagMap.get(spriteId);
    if (t) { t.destroy(); this.nameTagMap.delete(spriteId); }
    const b = this.levelBadgeMap.get(spriteId);
    if (b) { b.destroy(); this.levelBadgeMap.delete(spriteId); }
  }

  // ============================================================
  // World events
  // ============================================================

  private emitEvent(text: string, icon: string, category: WorldEvent['category'] = 'system') {
    if (this.onWorldEvent) {
      this.onWorldEvent({ time: this._worldClock, text, icon, category });
    }
  }

  // ============================================================
  // Observe / Edit mode
  // ============================================================

  startObserving() {
    this._isObserving = true;
    this._worldClock = 0;
    this._focusId = null;

    this.aiMap.clear();
    this.dataMap.forEach((data, sid) => {
      if (data.behavior === 'scenery') return;
      this.aiMap.set(sid, {
        spriteId: sid,
        vx: 0, vy: 0,
        stateTimer: Math.random() * 2,
        subState: 'idle',
        targetId: null,
        homeX: data.x,
        homeY: data.y,
        patrolRadius: 80 + Math.random() * 60,
        talkTimer: 0,
        talkText: '',
        memories: [],
        relationships: [],
        learnCooldown: 2 + Math.random() * 3,
        interactionCooldown: 0,
        discoveryCount: 0,
        totalXpEarned: 0,
      });
      this.showNameTag(sid);
    });

    this.spriteMap.forEach(img => img.clearTint());
    this.gridGraphics.setVisible(false);
    this.showClock();
    this.emitEvent(this.lang === 'zh' ? '世界开始运转... AI 开始学习' : 'The world begins... AI starts learning', '🌍', 'system');
  }

  stopObserving() {
    this._isObserving = false;
    this._focusId = null;
    this.aiMap.forEach(ai => { ai.vx = 0; ai.vy = 0; });
    this.bubbleMap.forEach(b => b.destroy());
    this.bubbleMap.clear();
    this.nameTagMap.forEach(t => t.destroy());
    this.nameTagMap.clear();
    this.levelBadgeMap.forEach(b => b.destroy());
    this.levelBadgeMap.clear();
    this.gridGraphics.setVisible(this.showGrid);
    this.hideClock();
    this.refreshTints();
    const w = Number(this.game.config.width);
    const h = Number(this.game.config.height);
    this.cameras.main.centerOn(w / 2, h / 2);

    if (this.onWorldStateChanged) this.onWorldStateChanged(false, this._worldClock);
  }

  setFocus(spriteId: string | null) { this._focusId = spriteId; }
  clearFocus() {
    this._focusId = null;
    const w = Number(this.game.config.width);
    const h = Number(this.game.config.height);
    this.cameras.main.centerOn(w / 2, h / 2);
  }

  // ============================================================
  // Clock HUD
  // ============================================================

  private showClock() {
    if (this.clockText) this.clockText.destroy();
    this.clockText = this.add.text(8, 8, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#a8fbd3',
      backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 6, y: 3 },
    });
    this.clockText.setDepth(999);
    this.clockText.setScrollFactor(0);
    this.updateClock();
  }

  private hideClock() {
    if (this.clockText) { this.clockText.destroy(); this.clockText = null; }
  }

  private updateClock() {
    if (!this.clockText) return;
    const m = Math.floor(this._worldClock / 60);
    const s = Math.floor(this._worldClock % 60);
    const ts = this._timeScale.toFixed(1);
    this.clockText.setText(`\u23F1 ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}  \u00D7${ts}`);
  }

  // ============================================================
  // Grid
  // ============================================================

  private drawGrid() {
    this.gridGraphics.clear();
    if (!this.showGrid) return;
    const width = Number(this.game.config.width);
    const height = Number(this.game.config.height);
    const gridSize = 32;
    this.gridGraphics.lineStyle(1, 0x2a2a4e, 0.3);
    for (let x = 0; x <= width; x += gridSize) this.gridGraphics.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += gridSize) this.gridGraphics.lineBetween(0, y, width, y);
  }

  toggleGrid(visible: boolean) {
    this.showGrid = visible;
    this.drawGrid();
    if (!this._isObserving) this.gridGraphics.setVisible(visible);
  }

  // ============================================================
  // Asset loading
  // ============================================================

  loadAssetImage(assetId: string, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.textures.exists(assetId)) { resolve(); return; }
      this.load.image(assetId, url);
      this.load.once('complete', () => resolve());
      this.load.once('loaderror', () => reject(new Error(`Failed to load: ${url}`)));
      this.load.start();
    });
  }

  // ============================================================
  // Sprite management
  // ============================================================

  placeSprite(data: PlacedSprite) {
    if (!this.textures.exists(data.assetId)) return;
    const img = this.add.image(data.x, data.y, data.assetId);
    img.setScale(data.scale);
    img.setInteractive({ pixelPerfect: false });
    img.setData('spriteId', data.id);
    img.setFlipX(data.flipX);
    img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.applyBehaviorTint(img, data.behavior);
    this.spriteMap.set(data.id, img);
    this.dataMap.set(data.id, data);
  }

  removeSprite(spriteId: string) {
    const s = this.spriteMap.get(spriteId);
    if (s) { s.destroy(); this.spriteMap.delete(spriteId); }
    this.dataMap.delete(spriteId);
    this.aiMap.delete(spriteId);
    this.hideBubble(spriteId);
    this.hideNameTag(spriteId);
  }

  updateSpritePosition(spriteId: string, x: number, y: number) {
    const s = this.spriteMap.get(spriteId);
    if (s) s.setPosition(x, y);
    const d = this.dataMap.get(spriteId);
    if (d) { d.x = x; d.y = y; }
  }

  updateSpriteScale(spriteId: string, scale: number) {
    const s = this.spriteMap.get(spriteId);
    if (s) s.setScale(scale);
    const d = this.dataMap.get(spriteId);
    if (d) d.scale = scale;
  }

  flipSprite(spriteId: string, flipX: boolean) {
    const s = this.spriteMap.get(spriteId);
    if (s) s.setFlipX(flipX);
    const d = this.dataMap.get(spriteId);
    if (d) d.flipX = flipX;
  }

  updateSpriteBehavior(spriteId: string, behavior: AIBehavior) {
    const d = this.dataMap.get(spriteId);
    if (d) d.behavior = behavior;
    const s = this.spriteMap.get(spriteId);
    if (s) this.applyBehaviorTint(s, behavior);
  }

  updateSpriteData(spriteId: string, partial: Partial<PlacedSprite>) {
    const d = this.dataMap.get(spriteId);
    if (d) Object.assign(d, partial);
  }

  private applyBehaviorTint(img: Phaser.GameObjects.Image, behavior: AIBehavior) {
    if (this._isObserving) { img.clearTint(); return; }
    switch (behavior) {
      case 'wanderer':    img.setTint(0x88ccff); break;
      case 'guardian':    img.setTint(0x88ff88); break;
      case 'merchant':    img.setTint(0xffdd88); break;
      case 'wildlife':    img.setTint(0xaaffaa); break;
      case 'predator':    img.setTint(0xff8888); break;
      case 'social':      img.setTint(0xff88ff); break;
      default: img.clearTint(); break;
    }
  }

  refreshTints() {
    this.spriteMap.forEach((img, id) => {
      const d = this.dataMap.get(id);
      this.applyBehaviorTint(img, d?.behavior || 'scenery');
    });
  }

  // ============================================================
  // Background
  // ============================================================

  setBackground(assetId: string) {
    if (this.bgImage) this.bgImage.destroy();
    if (!this.textures.exists(assetId)) return;
    const w = Number(this.game.config.width);
    const h = Number(this.game.config.height);
    this.bgImage = this.add.image(w / 2, h / 2, assetId);
    this.bgImage.setDisplaySize(w, h);
    this.bgImage.setDepth(-1);
    this.bgImage.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  clearBackground() {
    if (this.bgImage) { this.bgImage.destroy(); this.bgImage = null; }
  }

  // ============================================================
  // Drag (edit mode)
  // ============================================================

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (this._isObserving) return;
    const hits = this.input.hitTestPointer(pointer);
    if (hits.length > 0) {
      const top = hits[hits.length - 1] as Phaser.GameObjects.Image;
      if (top !== this.bgImage) {
        this.dragTarget = top;
        if (this.onSpriteSelected) this.onSpriteSelected(top.getData('spriteId'));
      }
    } else {
      this.dragTarget = null;
      if (this.onSpriteSelected) this.onSpriteSelected(null);
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (this._isObserving || !this.dragTarget || !pointer.isDown) return;
    this.dragTarget.x = pointer.x;
    this.dragTarget.y = pointer.y;
    const id = this.dragTarget.getData('spriteId');
    const d = this.dataMap.get(id);
    if (d) { d.x = Math.round(pointer.x); d.y = Math.round(pointer.y); }
    if (this.onSpritePositionChanged) {
      this.onSpritePositionChanged(id, Math.round(pointer.x), Math.round(pointer.y));
    }
  }

  private onPointerUp() { this.dragTarget = null; }

  // ============================================================
  // Screenshot & clear
  // ============================================================

  takeScreenshot(): Promise<string> {
    return new Promise((resolve) => {
      this.game.renderer.snapshot((image: Phaser.Display.Color | HTMLImageElement) => {
        if (image instanceof HTMLImageElement) resolve(image.src);
      });
    });
  }

  clearAll() {
    this.spriteMap.forEach((s) => s.destroy());
    this.spriteMap.clear();
    this.dataMap.clear();
    this.aiMap.clear();
    this.bubbleMap.forEach(b => b.destroy());
    this.bubbleMap.clear();
    this.nameTagMap.forEach(t => t.destroy());
    this.nameTagMap.clear();
    this.levelBadgeMap.forEach(b => b.destroy());
    this.levelBadgeMap.clear();
    this.clearBackground();
  }
}

// ============================================================
// Angular Component — Observer Interface with Agent Empowerment
// ============================================================

@Component({
  selector: 'app-playground',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './playground.component.html',
  styleUrls: ['./playground.component.scss'],
})
export class PlaygroundComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('gameContainer', { static: true }) gameContainer!: ElementRef;

  game: Phaser.Game | null = null;
  scene: ParallelWorldScene | null = null;

  // Asset library
  assets = signal<PlaygroundAsset[]>([]);
  newAssetUrl = '';
  newAssetName = '';
  newAssetType: 'character' | 'background' | 'prop' = 'character';
  isAddingAsset = signal(false);

  // Scene
  placedSprites = signal<PlacedSprite[]>([]);
  selectedSpriteId = signal<string | null>(null);

  // Canvas
  canvasWidth = 800;
  canvasHeight = 480;
  showGrid = true;

  // Panels
  activePanel: 'create' | 'assets' | 'scene' | 'properties' | 'log' | 'agent' = 'create';

  // Observe state
  isObserving = signal(false);
  worldClock = signal(0);
  timeScale = signal(1);
  focusEntityName = signal<string | null>(null);

  // World event log
  worldEvents = signal<WorldEvent[]>([]);
  eventFilter = signal<string>('all');

  // Import
  showImportModal = signal(false);
  historyItems: any[] = [];
  private pendingImport: any = null;

  // --- Agent Profile (for the selected agent) ---
  selectedAgentAI = signal<AIState | null>(null);
  selectedAgentMemories = signal<AgentMemory[]>([]);
  selectedAgentRelationships = signal<AgentRelationship[]>([]);

  constructor(
    private ngZone: NgZone,
    private translate: TranslateService,
    private generationService: GenerationService,
    private settingsService: SettingsService,
  ) {}

  // ===================================================================
  // World Map Generation
  // ===================================================================

  worldMaps = signal<{ id: string; name: string; url: string; prompt: string }[]>([]);
  activeMapIndex = signal(0);
  mapTheme = '';
  mapCount = 3;
  isGeneratingMaps = signal(false);
  mapGenProgress = signal('');

  async generateWorldMaps() {
    if (!this.settingsService.hasAnyApiKey()) {
      alert(this.translate.currentLang === 'zh'
        ? '请先在设置中配置API Key'
        : 'Please configure an API Key in Settings first');
      return;
    }

    this.isGeneratingMaps.set(true);
    const maps: { id: string; name: string; url: string; prompt: string }[] = [];
    const zh = this.translate.currentLang === 'zh';
    const theme = this.mapTheme.trim() || (zh ? '奇幻像素世界' : 'fantasy pixel world');
    const mapNames = zh
      ? ['主城广场', '暗黑森林', '荒野边境', '水晶洞穴']
      : ['Main City Square', 'Dark Forest', 'Wild Frontier', 'Crystal Cavern'];

    try {
      for (let i = 0; i < Math.min(this.mapCount, 4); i++) {
        const mapName = mapNames[i] || `Map ${i + 1}`;
        this.mapGenProgress.set(zh
          ? `正在生成地图 ${i + 1}/${this.mapCount}：${mapName}...`
          : `Generating map ${i + 1}/${this.mapCount}: ${mapName}...`);

        const promptResp = await firstValueFrom(this.generationService.generatePrompt({
          idea: `A wide panoramic pixel art game background scene for "${theme}" — area: ${mapName}. Top-down or side-scroll perspective. Detailed environment with rich pixel textures, no characters, only landscape and architecture. 1280x720 resolution.`,
          model_type: this.settingsService.getActiveModel(),
        }));

        const imgResp = await firstValueFrom(this.generationService.generateImage({
          task_id: this.generationService.generateTaskId('map'),
          prompt: promptResp.prompt,
          size: '1280*720',
          model_type: this.settingsService.getActiveModel(),
        }));

        const mapId = `map_${Date.now()}_${i}`;
        maps.push({ id: mapId, name: mapName, url: imgResp.url, prompt: promptResp.prompt });

        const assetId = `asset_${mapId}`;
        if (this.scene) {
          try { await this.scene.loadAssetImage(assetId, imgResp.url); } catch {}
        }
        const asset: PlaygroundAsset = { id: assetId, name: `\uD83D\uDDFA\uFE0F ${mapName}`, type: 'background', imageUrl: imgResp.url, loaded: true };
        this.assets.set([...this.assets(), asset]);

        this.storeToHistory(imgResp.url, promptResp.prompt, `\uD83D\uDDFA\uFE0F ${mapName}`);
      }

      this.worldMaps.set(maps);
      this.saveAssets();
      this.saveWorldMaps();

      if (maps.length > 0 && this.scene) {
        const firstAssetId = `asset_${maps[0].id}`;
        this.scene.setBackground(firstAssetId);
        this.activeMapIndex.set(0);
      }

      this.mapGenProgress.set(zh ? '\u2705 世界地图生成完成！' : '\u2705 World maps generated!');
    } catch (e: any) {
      this.mapGenProgress.set(zh ? `\u274C 生成失败：${e.message}` : `\u274C Generation failed: ${e.message}`);
    } finally {
      this.isGeneratingMaps.set(false);
    }
  }

  switchMap(index: number) {
    const maps = this.worldMaps();
    if (index < 0 || index >= maps.length || !this.scene) return;
    this.activeMapIndex.set(index);
    const assetId = `asset_${maps[index].id}`;
    try { this.scene.setBackground(assetId); } catch {}
  }

  private saveWorldMaps() {
    localStorage.setItem('pixelda_world_maps', JSON.stringify(this.worldMaps()));
  }

  private loadWorldMaps() {
    const saved = localStorage.getItem('pixelda_world_maps');
    if (saved) {
      try { this.worldMaps.set(JSON.parse(saved)); }
      catch { localStorage.removeItem('pixelda_world_maps'); }
    }
  }

  // ===================================================================
  // Single Entity Pipeline
  // ===================================================================

  pipelineActive = signal(false);
  pipelineStep = signal('');
  pipelineStepNum = signal(0);
  pipelineEntityName = '';
  pipelineEntityHint = '';
  pipelineMotionHint = '';
  pipelineBehavior: AIBehavior = 'wanderer';
  pipelineResults = signal<{
    imageUrl?: string;
    videoUrl?: string;
    frameUrls?: string[];
    spriteUrl?: string;
  }>({});

  async runEntityPipeline() {
    if (!this.settingsService.hasAnyApiKey()) {
      alert(this.translate.currentLang === 'zh'
        ? '请先在设置中配置API Key'
        : 'Please configure an API Key in Settings first');
      return;
    }

    const zh = this.translate.currentLang === 'zh';
    const entityName = this.pipelineEntityName.trim() || (zh ? '像素角色' : 'Pixel Character');
    const hint = this.pipelineEntityHint.trim();
    const motionHint = this.pipelineMotionHint.trim();
    const modelType = this.settingsService.getActiveModel();

    this.pipelineActive.set(true);
    this.pipelineResults.set({});

    try {
      // Step 1: Generate prompt
      this.pipelineStepNum.set(1);
      this.pipelineStep.set(zh ? '\uD83E\uDD16 AI 设计角色中...' : '\uD83E\uDD16 AI designing character...');

      const promptResp = await firstValueFrom(this.generationService.generatePrompt({
        idea: hint
          ? `Pixel art game character: ${entityName}. ${hint}. Single character on transparent/simple background. Suitable for game sprite.`
          : `Pixel art game character: ${entityName}. Single character on transparent/simple background. Suitable for game sprite.`,
        model_type: modelType,
      }));

      // Step 2: Generate image
      this.pipelineStepNum.set(2);
      this.pipelineStep.set(zh ? '\uD83C\uDFA8 生成角色图像...' : '\uD83C\uDFA8 Generating character image...');

      const imgResp = await firstValueFrom(this.generationService.generateImage({
        task_id: this.generationService.generateTaskId('entity'),
        prompt: promptResp.prompt,
        size: '1024*1024',
        model_type: modelType,
      }));

      this.pipelineResults.set({ imageUrl: imgResp.url });

      // Step 3: Generate animation prompt
      this.pipelineStepNum.set(3);
      this.pipelineStep.set(zh ? '\uD83C\uDFAC AI 编排动画...' : '\uD83C\uDFAC AI choreographing animation...');

      const animPromptResp = await firstValueFrom(this.generationService.generateAnimationPrompt({
        image_url: imgResp.url,
        motion_hint: motionHint || undefined,
        model_type: modelType,
      }));

      // Step 4: Generate video/animation
      this.pipelineStepNum.set(4);
      this.pipelineStep.set(zh ? '\uD83C\uDFA5 生成动画...' : '\uD83C\uDFA5 Generating animation...');

      const videoResp = await firstValueFrom(this.generationService.generateVideo({
        task_id: this.generationService.generateTaskId('anim'),
        base_image_url: imgResp.url,
        prompt: animPromptResp.prompt,
        resolution: '480P',
        model_type: modelType,
      }));

      this.pipelineResults.set({ ...this.pipelineResults(), videoUrl: videoResp.url });

      // Step 5: Split to frames
      this.pipelineStepNum.set(5);
      this.pipelineStep.set(zh ? '\u2702\uFE0F 提取精灵帧...' : '\u2702\uFE0F Extracting sprite frames...');

      const framesResp = await firstValueFrom(this.generationService.splitVideoFrames({
        task_id: this.generationService.generateTaskId('frames'),
        video_url: videoResp.url,
        from_time: 0,
        to_time: 5,
        count: 8,
      }));

      this.pipelineResults.set({ ...this.pipelineResults(), frameUrls: framesResp.frames });

      // Step 6: Auto-enter world with AI empowerment
      this.pipelineStepNum.set(6);
      this.pipelineStep.set(zh ? '\uD83C\uDF0D 赋能 AI 并放入世界...' : '\uD83C\uDF0D Empowering AI & entering world...');

      await this.autoPlaceEntity(entityName, imgResp.url, this.pipelineBehavior);

      this.storeToHistory(imgResp.url, promptResp.prompt, entityName);
      this.storeToHistory(videoResp.url, `animation: ${entityName}`, `\uD83C\uDFAC ${entityName}`);

      this.pipelineStep.set(zh
        ? `\u2705 ${entityName} 已赋能并进入世界！`
        : `\u2705 ${entityName} empowered and entered the world!`);

      this.pipelineEntityName = '';
      this.pipelineEntityHint = '';
      this.pipelineMotionHint = '';

    } catch (e: any) {
      this.pipelineStep.set(zh ? `\u274C 失败：${e.message}` : `\u274C Failed: ${e.message}`);
    } finally {
      setTimeout(() => {
        this.pipelineActive.set(false);
        this.pipelineStepNum.set(0);
      }, 2000);
    }
  }

  /** Helper: create asset, assign agent personality/skills, place randomly */
  private async autoPlaceEntity(name: string, imageUrl: string, behavior: AIBehavior): Promise<string> {
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    if (this.scene) {
      try { await this.scene.loadAssetImage(assetId, imageUrl); } catch {}
    }
    const asset: PlaygroundAsset = {
      id: assetId, name, type: 'character', imageUrl, loaded: true,
    };
    this.assets.set([...this.assets(), asset]);
    this.saveAssets();

    const spriteId = `sprite_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const rx = 80 + Math.random() * (this.canvasWidth - 160);
    const ry = 80 + Math.random() * (this.canvasHeight - 160);
    const placed: PlacedSprite = {
      id: spriteId, assetId,
      x: Math.round(rx), y: Math.round(ry),
      scale: 0.5, flipX: false,
      behavior, speed: 40, interactionRadius: 120,
      displayName: name,
      // Agent empowerment init
      level: 1,
      xp: 0,
      xpToNext: xpForLevel(1),
      personality: generatePersonality(behavior),
      skills: generateSkills(behavior),
    };
    if (this.scene) this.scene.placeSprite(placed);
    this.placedSprites.set([...this.placedSprites(), placed]);
    this.saveScene();
    return spriteId;
  }

  // ===================================================================
  // ONE-CLICK WORLD BUILDER
  // ===================================================================

  worldBuilderActive = signal(false);
  worldBuilderPhase = signal('');
  worldBuilderProgress = signal(0);
  worldBuilderLog = signal<PipelineLogEntry[]>([]);
  worldBuilderAutoObserve = true;

  worldBuilderEntities = signal<WorldBuilderEntity[]>([
    { name: '', hint: '', behavior: 'wanderer', motionHint: '' },
  ]);

  addWorldBuilderEntity() {
    this.worldBuilderEntities.set([...this.worldBuilderEntities(), {
      name: '', hint: '', behavior: 'wanderer', motionHint: '',
    }]);
  }

  removeWorldBuilderEntity(index: number) {
    const entities = this.worldBuilderEntities();
    if (entities.length <= 1) return;
    this.worldBuilderEntities.set(entities.filter((_, i) => i !== index));
  }

  updateWorldBuilderEntity(index: number, field: keyof WorldBuilderEntity, value: string) {
    const entities = [...this.worldBuilderEntities()];
    entities[index] = { ...entities[index], [field]: value };
    this.worldBuilderEntities.set(entities);
  }

  private addLogEntry(step: string, status: PipelineLogEntry['status'], detail: string, url?: string) {
    const log = [...this.worldBuilderLog()];
    const existing = log.findIndex(e => e.step === step);
    if (existing >= 0) {
      log[existing] = { step, status, detail, url };
    } else {
      log.push({ step, status, detail, url });
    }
    this.worldBuilderLog.set(log);
  }

  async runWorldBuilder() {
    if (!this.settingsService.hasAnyApiKey()) {
      alert(this.translate.currentLang === 'zh'
        ? '请先在设置中配置API Key'
        : 'Please configure an API Key in Settings first');
      return;
    }

    const zh = this.translate.currentLang === 'zh';
    const modelType = this.settingsService.getActiveModel();
    const theme = this.mapTheme.trim() || (zh ? '奇幻像素世界' : 'fantasy pixel world');
    const entities = this.worldBuilderEntities().filter(e => e.name.trim());

    if (entities.length === 0) {
      alert(zh ? '请至少填写一个角色名称' : 'Please fill in at least one entity name');
      return;
    }

    this.worldBuilderActive.set(true);
    this.worldBuilderLog.set([]);
    this.worldBuilderProgress.set(0);

    const totalSteps = this.mapCount + (entities.length * 4);
    let completed = 0;
    const updateProgress = () => {
      completed++;
      this.worldBuilderProgress.set(Math.round((completed / totalSteps) * 100));
    };

    try {
      // PHASE 1: Generate World Maps
      this.worldBuilderPhase.set(zh ? '\uD83D\uDDFA\uFE0F 第一阶段：生成世界地图...' : '\uD83D\uDDFA\uFE0F Phase 1: Generating world maps...');

      const maps: { id: string; name: string; url: string; prompt: string }[] = [];
      const mapNames = zh
        ? ['主城广场', '暗黑森林', '荒野边境', '水晶洞穴']
        : ['Main City Square', 'Dark Forest', 'Wild Frontier', 'Crystal Cavern'];

      for (let i = 0; i < Math.min(this.mapCount, 4); i++) {
        const mapName = mapNames[i] || `Map ${i + 1}`;
        const stepName = `map_${i}`;
        this.addLogEntry(stepName, 'running', zh ? `生成地图: ${mapName}` : `Generating map: ${mapName}`);

        try {
          const promptResp = await firstValueFrom(this.generationService.generatePrompt({
            idea: `A wide panoramic pixel art game background scene for "${theme}" — area: ${mapName}. Top-down or side-scroll perspective. Detailed environment with rich pixel textures, no characters, only landscape and architecture. 1280x720 resolution.`,
            model_type: modelType,
          }));

          const imgResp = await firstValueFrom(this.generationService.generateImage({
            task_id: this.generationService.generateTaskId('map'),
            prompt: promptResp.prompt,
            size: '1280*720',
            model_type: modelType,
          }));

          const mapId = `map_${Date.now()}_${i}`;
          maps.push({ id: mapId, name: mapName, url: imgResp.url, prompt: promptResp.prompt });

          const assetId = `asset_${mapId}`;
          if (this.scene) {
            try { await this.scene.loadAssetImage(assetId, imgResp.url); } catch {}
          }
          this.assets.set([...this.assets(), {
            id: assetId, name: `\uD83D\uDDFA\uFE0F ${mapName}`, type: 'background', imageUrl: imgResp.url, loaded: true,
          }]);

          this.storeToHistory(imgResp.url, promptResp.prompt, `\uD83D\uDDFA\uFE0F ${mapName}`);
          this.addLogEntry(stepName, 'done', `\u2705 ${mapName}`, imgResp.url);
        } catch (e: any) {
          this.addLogEntry(stepName, 'error', `\u274C ${mapName}: ${e.message}`);
        }
        updateProgress();
      }

      this.worldMaps.set(maps);
      this.saveWorldMaps();
      this.saveAssets();

      if (maps.length > 0 && this.scene) {
        this.scene.setBackground(`asset_${maps[0].id}`);
        this.activeMapIndex.set(0);
      }

      // PHASE 2: Generate Entities with AI empowerment
      this.worldBuilderPhase.set(zh ? '\uD83E\uDE84 第二阶段：生成角色并赋能 AI...' : '\uD83E\uDE84 Phase 2: Generating & empowering AI agents...');

      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const eName = entity.name.trim();
        const stepPrefix = `entity_${i}`;

        this.addLogEntry(`${stepPrefix}_img`, 'running',
          zh ? `生成角色图像: ${eName}` : `Generating character image: ${eName}`);

        try {
          const promptResp = await firstValueFrom(this.generationService.generatePrompt({
            idea: entity.hint
              ? `Pixel art game character: ${eName}. ${entity.hint}. Single character on transparent/simple background. Suitable for game sprite.`
              : `Pixel art game character: ${eName}. Single character on transparent/simple background. Suitable for game sprite.`,
            model_type: modelType,
          }));

          const imgResp = await firstValueFrom(this.generationService.generateImage({
            task_id: this.generationService.generateTaskId('entity'),
            prompt: promptResp.prompt,
            size: '1024*1024',
            model_type: modelType,
          }));

          this.addLogEntry(`${stepPrefix}_img`, 'done',
            zh ? `\u2705 ${eName} 图像就绪` : `\u2705 ${eName} image ready`, imgResp.url);
          updateProgress();

          // Animation step
          this.addLogEntry(`${stepPrefix}_anim`, 'running',
            zh ? `生成动画: ${eName}` : `Generating animation: ${eName}`);

          try {
            const animPromptResp = await firstValueFrom(this.generationService.generateAnimationPrompt({
              image_url: imgResp.url,
              motion_hint: entity.motionHint || undefined,
              model_type: modelType,
            }));

            const videoResp = await firstValueFrom(this.generationService.generateVideo({
              task_id: this.generationService.generateTaskId('anim'),
              base_image_url: imgResp.url,
              prompt: animPromptResp.prompt,
              resolution: '480P',
              model_type: modelType,
            }));

            const framesResp = await firstValueFrom(this.generationService.splitVideoFrames({
              task_id: this.generationService.generateTaskId('frames'),
              video_url: videoResp.url,
              from_time: 0,
              to_time: 5,
              count: 8,
            }));

            this.storeToHistory(videoResp.url, `animation: ${eName}`, `\uD83C\uDFAC ${eName}`);
            if (framesResp.frames && framesResp.frames.length > 0) {
              this.storeToHistory(framesResp.frames[0], `spriteframe: ${eName}`, `\uD83D\uDDBC\uFE0F ${eName}`);
            }

            this.addLogEntry(`${stepPrefix}_anim`, 'done',
              zh ? `\u2705 ${eName} 动画就绪 (${framesResp.frames?.length || 0}帧)` :
              `\u2705 ${eName} animation ready (${framesResp.frames?.length || 0} frames)`, videoResp.url);
          } catch (animErr: any) {
            this.addLogEntry(`${stepPrefix}_anim`, 'error',
              zh ? `\u26A0\uFE0F ${eName} 动画失败(仍放入世界): ${animErr.message}` :
              `\u26A0\uFE0F ${eName} animation failed (still placing): ${animErr.message}`);
          }
          updateProgress();

          // Place in world with empowerment
          this.addLogEntry(`${stepPrefix}_place`, 'running',
            zh ? `赋能 AI 并放入世界: ${eName}` : `Empowering AI & placing: ${eName}`);

          await this.autoPlaceEntity(eName, imgResp.url, entity.behavior as AIBehavior);
          this.storeToHistory(imgResp.url, promptResp.prompt, eName);

          this.addLogEntry(`${stepPrefix}_place`, 'done',
            zh ? `\u2705 ${eName} 已赋能并放入世界` : `\u2705 ${eName} empowered & placed`);
          updateProgress();

        } catch (e: any) {
          this.addLogEntry(`${stepPrefix}_img`, 'error',
            zh ? `\u274C ${eName} 失败: ${e.message}` : `\u274C ${eName} failed: ${e.message}`);
          updateProgress();
          updateProgress();
          updateProgress();
        }
      }

      // PHASE 3: Complete
      this.worldBuilderProgress.set(100);
      this.saveAssets();
      this.saveScene();

      const entityCount = this.placedSprites().filter(s => s.behavior !== 'scenery').length;
      this.worldBuilderPhase.set(zh
        ? `\uD83C\uDF89 世界构建完成！${maps.length} 张地图, ${entityCount} 个 AI Agent 已赋能就绪`
        : `\uD83C\uDF89 World built! ${maps.length} maps, ${entityCount} AI agents empowered & ready`);

      if (this.worldBuilderAutoObserve && entityCount > 0) {
        setTimeout(() => {
          this.ngZone.run(() => {
            if (!this.isObserving()) {
              this.toggleObserve();
            }
            this.worldBuilderActive.set(false);
          });
        }, 2500);
      } else {
        setTimeout(() => this.worldBuilderActive.set(false), 3000);
      }

    } catch (e: any) {
      this.worldBuilderPhase.set(zh ? `\u274C 构建失败: ${e.message}` : `\u274C Build failed: ${e.message}`);
      setTimeout(() => this.worldBuilderActive.set(false), 3000);
    }
  }

  // ===================================================================
  // History / persistence helpers
  // ===================================================================

  private storeToHistory(url: string, prompt: string, name: string) {
    const saved = localStorage.getItem('pixelda_generation_history');
    let history: any[] = [];
    if (saved) { try { history = JSON.parse(saved); } catch {} }
    history.unshift({
      id: `gen_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      type: 'image',
      url, prompt,
      name,
      timestamp: Date.now(),
    });
    if (history.length > 100) history = history.slice(0, 100);
    localStorage.setItem('pixelda_generation_history', JSON.stringify(history));
  }

  ngOnInit() {
    this.loadAssets();
    this.loadScene();
    this.loadWorldMaps();
    this.loadHistoryItems();
    this.checkPendingImport();
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => this.initPhaser());
  }

  ngOnDestroy() {
    this.saveAssets();
    this.saveScene();
    if (this.game) { this.game.destroy(true); this.game = null; }
  }

  private initPhaser() {
    const scene = new ParallelWorldScene();
    scene.lang = (this.translate.currentLang === 'zh' ? 'zh' : 'en');

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: this.canvasWidth,
      height: this.canvasHeight,
      parent: this.gameContainer.nativeElement,
      backgroundColor: '#1a1a2e',
      pixelArt: true,
      scene,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: false, pixelArt: true },
      input: { keyboard: true },
    };

    this.game = new Phaser.Game(config);
    this.scene = scene;

    this.game.events.once('ready', () => {
      scene.onSpriteSelected = (id) => this.ngZone.run(() => {
        this.selectedSpriteId.set(id);
        if (id) {
          if (this.isObserving()) {
            const d = this.placedSprites().find(s => s.id === id);
            this.focusEntityName.set(d?.displayName || null);
            this.refreshAgentProfile(id);
            this.activePanel = 'agent';
          } else {
            this.activePanel = 'properties';
          }
        }
      });

      scene.onSpritePositionChanged = (id, x, y) => this.ngZone.run(() => {
        const sprites = this.placedSprites();
        const idx = sprites.findIndex(s => s.id === id);
        if (idx >= 0) {
          const updated = [...sprites];
          updated[idx] = { ...updated[idx], x, y };
          this.placedSprites.set(updated);
        }
      });

      scene.onWorldStateChanged = (_observing, clock) => this.ngZone.run(() => {
        this.worldClock.set(clock);
        // Periodically refresh agent profile
        if (this.selectedSpriteId() && this.isObserving()) {
          this.refreshAgentProfile(this.selectedSpriteId()!);
        }
      });

      scene.onWorldEvent = (evt) => this.ngZone.run(() => {
        this.worldEvents.set([evt, ...this.worldEvents().slice(0, 99)]);
      });

      scene.onAgentLevelUp = (spriteId, newLevel) => this.ngZone.run(() => {
        const sprites = this.placedSprites();
        const idx = sprites.findIndex(s => s.id === spriteId);
        if (idx >= 0) {
          const updated = [...sprites];
          updated[idx] = { ...updated[idx], level: newLevel };
          this.placedSprites.set(updated);
        }
      });

      scene.onAgentSkillGain = (spriteId, skill, newValue) => this.ngZone.run(() => {
        // Update placed sprite skills
        const sprites = this.placedSprites();
        const idx = sprites.findIndex(s => s.id === spriteId);
        if (idx >= 0) {
          const updated = [...sprites];
          const s = { ...updated[idx], skills: { ...updated[idx].skills } };
          (s.skills as any)[skill] = newValue;
          updated[idx] = s;
          this.placedSprites.set(updated);
        }
      });

      setTimeout(() => {
        this.restoreScene();
        setTimeout(() => this.ngZone.run(() => this.processPendingImport()), 300);
      }, 500);
    });
  }

  // === Agent Profile ===

  refreshAgentProfile(spriteId: string) {
    if (!this.scene) return;
    const ai = this.scene.getAIState(spriteId);
    if (ai) {
      this.selectedAgentAI.set({ ...ai });
      this.selectedAgentMemories.set([...ai.memories].reverse().slice(0, 20));
      this.selectedAgentRelationships.set([...ai.relationships]);
    }
  }

  // === Observe / Edit toggle ===

  toggleObserve() {
    if (!this.scene) return;
    if (this.isObserving()) {
      this.scene.stopObserving();
      this.isObserving.set(false);
      this.focusEntityName.set(null);
      this.selectedAgentAI.set(null);
    } else {
      const hasEntities = this.placedSprites().some(s => s.behavior !== 'scenery');
      if (!hasEntities) {
        alert(this.translate.currentLang === 'zh'
          ? '请先放置一些有AI行为的实体（非"静物"）'
          : 'Please place some entities with AI behavior (not "Scenery") first');
        return;
      }
      this.scene.lang = (this.translate.currentLang === 'zh' ? 'zh' : 'en');
      this.worldEvents.set([]);
      this.saveScene();
      this.scene.startObserving();
      this.isObserving.set(true);
      this.activePanel = 'log';
    }
  }

  changeTimeScale(delta: number) {
    const newVal = Math.round((this.timeScale() + delta) * 4) / 4;
    const clamped = Math.max(0.25, Math.min(3, newVal));
    this.timeScale.set(clamped);
    if (this.scene) this.scene.timeScale = clamped;
  }

  focusEntity(spriteId: string) {
    if (!this.scene) return;
    this.scene.setFocus(spriteId);
    this.selectedSpriteId.set(spriteId);
    const d = this.placedSprites().find(s => s.id === spriteId);
    this.focusEntityName.set(d?.displayName || null);
    if (this.isObserving()) {
      this.refreshAgentProfile(spriteId);
      this.activePanel = 'agent';
    }
  }

  clearFocus() {
    if (!this.scene) return;
    this.scene.clearFocus();
    this.selectedSpriteId.set(null);
    this.focusEntityName.set(null);
  }

  // === Asset management ===

  async addAssetFromUrl() {
    const url = this.newAssetUrl.trim();
    if (!url) return;
    const name = this.newAssetName.trim() || `Asset_${Date.now()}`;
    const id = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.isAddingAsset.set(true);
    try {
      if (this.scene) await this.scene.loadAssetImage(id, url);
      const asset: PlaygroundAsset = { id, name, type: this.newAssetType, imageUrl: url, loaded: true };
      this.assets.set([...this.assets(), asset]);
      this.newAssetUrl = '';
      this.newAssetName = '';
      this.saveAssets();
    } catch { alert('Failed to load image from URL'); }
    finally { this.isAddingAsset.set(false); }
  }

  async importFromHistory(item: any) {
    const url = item.url;
    if (!url) return;
    const name = item.prompt ? item.prompt.substring(0, 30) : `Import_${Date.now()}`;
    const id = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    try {
      if (this.scene) await this.scene.loadAssetImage(id, url);
      const asset: PlaygroundAsset = { id, name, type: item.type === 'image' ? 'character' : 'prop', imageUrl: url, loaded: true };
      this.assets.set([...this.assets(), asset]);
      this.saveAssets();
      this.showImportModal.set(false);
    } catch { alert('Failed to load image'); }
  }

  removeAsset(assetId: string) {
    this.placedSprites().filter(s => s.assetId === assetId).forEach(s => this.scene?.removeSprite(s.id));
    this.placedSprites.set(this.placedSprites().filter(s => s.assetId !== assetId));
    this.assets.set(this.assets().filter(a => a.id !== assetId));
    this.saveAssets();
    this.saveScene();
  }

  // === Scene ===

  async placeAssetOnCanvas(asset: PlaygroundAsset) {
    if (!this.scene) return;
    try { await this.scene.loadAssetImage(asset.id, asset.imageUrl); } catch { return; }

    if (asset.type === 'background') { this.scene.setBackground(asset.id); return; }

    const spriteId = `sprite_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const placed: PlacedSprite = {
      id: spriteId, assetId: asset.id,
      x: this.canvasWidth / 2, y: this.canvasHeight / 2,
      scale: 0.5, flipX: false,
      behavior: 'wanderer', speed: 40, interactionRadius: 120,
      displayName: asset.name,
      level: 1, xp: 0, xpToNext: xpForLevel(1),
      personality: generatePersonality('wanderer'),
      skills: generateSkills('wanderer'),
    };

    this.scene.placeSprite(placed);
    this.placedSprites.set([...this.placedSprites(), placed]);
    this.saveScene();
  }

  removePlacedSprite(spriteId: string) {
    this.scene?.removeSprite(spriteId);
    this.placedSprites.set(this.placedSprites().filter(s => s.id !== spriteId));
    if (this.selectedSpriteId() === spriteId) this.selectedSpriteId.set(null);
    this.saveScene();
  }

  // === Properties ===

  getSelectedSprite(): PlacedSprite | null {
    const id = this.selectedSpriteId();
    return id ? this.placedSprites().find(s => s.id === id) || null : null;
  }

  getAssetName(assetId: string): string {
    return this.assets().find(a => a.id === assetId)?.name || 'Unknown';
  }

  updateSpriteScale(spriteId: string, scale: number) {
    this.scene?.updateSpriteScale(spriteId, scale);
    this.updateSpriteField(spriteId, { scale });
  }

  flipSelectedSprite() {
    const s = this.getSelectedSprite();
    if (!s) return;
    const f = !s.flipX;
    this.scene?.flipSprite(s.id, f);
    this.updateSpriteField(s.id, { flipX: f });
  }

  updateBehavior(spriteId: string, behavior: AIBehavior) {
    this.scene?.updateSpriteBehavior(spriteId, behavior);
    // Regenerate personality and skills for new behavior
    const newPersonality = generatePersonality(behavior);
    const newSkills = generateSkills(behavior);
    this.updateSpriteField(spriteId, { behavior, personality: newPersonality, skills: newSkills });
    this.scene?.updateSpriteData(spriteId, { personality: newPersonality, skills: newSkills });
  }

  updateSpriteSpeed(spriteId: string, speed: number) {
    this.scene?.updateSpriteData(spriteId, { speed });
    this.updateSpriteField(spriteId, { speed });
  }

  updateInteractionRadius(spriteId: string, radius: number) {
    this.scene?.updateSpriteData(spriteId, { interactionRadius: radius });
    this.updateSpriteField(spriteId, { interactionRadius: radius });
  }

  updateDisplayName(spriteId: string, name: string) {
    this.scene?.updateSpriteData(spriteId, { displayName: name });
    this.updateSpriteField(spriteId, { displayName: name });
  }

  private updateSpriteField(spriteId: string, partial: Partial<PlacedSprite>) {
    const sprites = this.placedSprites();
    const idx = sprites.findIndex(s => s.id === spriteId);
    if (idx >= 0) {
      const updated = [...sprites];
      updated[idx] = { ...updated[idx], ...partial };
      this.placedSprites.set(updated);
    }
    this.saveScene();
  }

  // === Canvas controls ===

  toggleGrid() { this.showGrid = !this.showGrid; this.scene?.toggleGrid(this.showGrid); }

  async takeScreenshot() {
    if (!this.scene) return;
    const url = await this.scene.takeScreenshot();
    const a = document.createElement('a');
    a.href = url;
    a.download = `synapse_world_${Date.now()}.png`;
    a.click();
  }

  clearScene() {
    this.scene?.clearAll();
    this.placedSprites.set([]);
    this.selectedSpriteId.set(null);
    this.worldEvents.set([]);
    this.saveScene();
  }

  // === Import ===

  openImportModal() { this.loadHistoryItems(); this.showImportModal.set(true); }
  closeImportModal() { this.showImportModal.set(false); }

  // === Persistence ===

  private saveAssets() {
    const data = this.assets().map(a => ({ id: a.id, name: a.name, type: a.type, imageUrl: a.imageUrl }));
    localStorage.setItem('pixelda_playground_assets', JSON.stringify(data));
  }

  private loadAssets() {
    const saved = localStorage.getItem('pixelda_playground_assets');
    if (saved) {
      try { this.assets.set(JSON.parse(saved).map((a: any) => ({ ...a, loaded: false }))); }
      catch { localStorage.removeItem('pixelda_playground_assets'); }
    }
  }

  private saveScene() {
    const data = this.placedSprites().map(s => ({
      id: s.id, assetId: s.assetId, x: s.x, y: s.y, scale: s.scale, flipX: s.flipX,
      behavior: s.behavior, speed: s.speed, interactionRadius: s.interactionRadius,
      displayName: s.displayName,
      level: s.level, xp: s.xp, xpToNext: s.xpToNext,
      personality: s.personality, skills: s.skills,
    }));
    localStorage.setItem('pixelda_playground_scene', JSON.stringify(data));
  }

  private loadScene() {
    const saved = localStorage.getItem('pixelda_playground_scene');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const migrated = data.map((s: any) => ({
          behavior: 'wanderer', speed: 40, interactionRadius: 120,
          displayName: s.displayName || 'Entity',
          level: 1, xp: 0, xpToNext: xpForLevel(1),
          personality: generatePersonality(s.behavior || 'wanderer'),
          skills: generateSkills(s.behavior || 'wanderer'),
          ...s,
        }));
        this.placedSprites.set(migrated);
      } catch { localStorage.removeItem('pixelda_playground_scene'); }
    }
  }

  private async restoreScene() {
    for (const asset of this.assets()) {
      try { await this.scene?.loadAssetImage(asset.id, asset.imageUrl); asset.loaded = true; } catch {}
    }
    for (const sprite of this.placedSprites()) {
      this.scene?.placeSprite(sprite);
    }
    const maps = this.worldMaps();
    if (maps.length > 0 && this.scene) {
      const idx = this.activeMapIndex();
      if (idx < maps.length) {
        const assetId = `asset_${maps[idx].id}`;
        try { this.scene.setBackground(assetId); } catch {}
      }
    }
  }

  private loadHistoryItems() {
    const saved = localStorage.getItem('pixelda_generation_history');
    if (saved) {
      try { this.historyItems = JSON.parse(saved).filter((i: any) => i.type === 'image' && i.url); }
      catch { this.historyItems = []; }
    }
  }

  private checkPendingImport() {
    const pending = localStorage.getItem('pixelda_playground_import');
    if (pending) {
      localStorage.removeItem('pixelda_playground_import');
      try { this.pendingImport = JSON.parse(pending); } catch {}
    }
  }

  private async processPendingImport() {
    if (!this.pendingImport || !this.scene) return;
    const data = this.pendingImport;
    this.pendingImport = null;
    const id = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    try {
      await this.scene.loadAssetImage(id, data.url);
      const asset: PlaygroundAsset = { id, name: data.name || `Import_${Date.now()}`, type: data.type || 'character', imageUrl: data.url, loaded: true };
      this.assets.set([...this.assets(), asset]);
      this.saveAssets();
      await this.placeAssetOnCanvas(asset);
    } catch {}
  }

  // ===================================================================
  // Display helpers
  // ===================================================================

  getBehaviorLabel(behavior: AIBehavior): string {
    const zh = this.translate.currentLang === 'zh';
    const labels: Record<AIBehavior, string> = {
      wanderer:  zh ? '\uD83D\uDD35 漫游者' : '\uD83D\uDD35 Wanderer',
      guardian:  zh ? '\uD83D\uDFE2 守卫' : '\uD83D\uDFE2 Guardian',
      merchant:  zh ? '\uD83D\uDFE1 商人' : '\uD83D\uDFE1 Merchant',
      wildlife:  zh ? '\uD83D\uDFE4 野生动物' : '\uD83D\uDFE4 Wildlife',
      predator:  zh ? '\uD83D\uDD34 捕食者' : '\uD83D\uDD34 Predator',
      social:    zh ? '\uD83D\uDFE3 社交者' : '\uD83D\uDFE3 Social',
      scenery:   zh ? '\u26AA 静物' : '\u26AA Scenery',
    };
    return labels[behavior] || behavior;
  }

  getBehaviorDesc(behavior: AIBehavior): string {
    const zh = this.translate.currentLang === 'zh';
    const descs: Record<AIBehavior, string> = {
      wanderer:  zh ? '随机漫步，好奇心驱动探索，学习采集技能' : 'Roams randomly, curiosity-driven, learns foraging',
      guardian:  zh ? '巡逻守卫，学习战斗技能，可成为导师' : 'Patrols & guards, learns combat, can mentor others',
      merchant:  zh ? '驻留原地，学习谈判技能，与他人交易' : 'Stays in place, learns negotiation, trades with others',
      wildlife:  zh ? '缓慢漫步，学习潜行技能，遇危险逃跑' : 'Moves slowly, learns stealth, flees from danger',
      predator:  zh ? '追捕猎物，学习战斗技能，狡猾进化' : 'Hunts prey, learns combat, evolves cunning',
      social:    zh ? '寻找同伴，学习领导力，建立关系网络' : 'Seeks others, learns leadership, builds relationships',
      scenery:   zh ? '纯装饰，不参与世界运行' : 'Purely decorative, no AI',
    };
    return descs[behavior] || '';
  }

  getSkillName(skill: string): string {
    const zh = this.translate.currentLang === 'zh';
    return (zh ? SKILL_NAMES_ZH : SKILL_NAMES_EN)[skill as keyof AgentSkills] || skill;
  }

  getTraitName(trait: string): string {
    const zh = this.translate.currentLang === 'zh';
    return (zh ? TRAIT_NAMES_ZH : TRAIT_NAMES_EN)[trait as keyof PersonalityTraits] || trait;
  }

  getRelationIcon(type: string): string {
    switch (type) {
      case 'friend': return '\uD83D\uDC9A';
      case 'ally': return '\uD83D\uDC99';
      case 'rival': return '\u2694\uFE0F';
      case 'mentor': return '\uD83C\uDF93';
      case 'acquaintance': return '\uD83D\uDC4B';
      default: return '\u2753';
    }
  }

  getRelationLabel(type: string): string {
    const zh = this.translate.currentLang === 'zh';
    const map: Record<string, string> = zh
      ? { stranger: '陌生人', acquaintance: '相识', friend: '朋友', rival: '对手', mentor: '导师', ally: '盟友' }
      : { stranger: 'Stranger', acquaintance: 'Acquaintance', friend: 'Friend', rival: 'Rival', mentor: 'Mentor', ally: 'Ally' };
    return map[type] || type;
  }

  getMemoryIcon(type: string): string {
    switch (type) {
      case 'encounter': return '\uD83D\uDC4B';
      case 'trade': return '\uD83D\uDCB0';
      case 'fight': return '\u2694\uFE0F';
      case 'discovery': return '\uD83D\uDD0D';
      case 'lesson': return '\uD83D\uDCDA';
      case 'gift': return '\uD83C\uDF81';
      case 'flee': return '\uD83C\uDFC3';
      default: return '\u2B50';
    }
  }

  getSkillKeys(sprite: PlacedSprite): string[] {
    return Object.keys(sprite.skills);
  }

  getTraitKeys(sprite: PlacedSprite): string[] {
    return Object.keys(sprite.personality);
  }

  getSkillValue(sprite: PlacedSprite, key: string): number {
    return (sprite.skills as any)[key] || 0;
  }

  getTraitValue(sprite: PlacedSprite, key: string): number {
    return (sprite.personality as any)[key] || 0;
  }

  filteredEvents(): WorldEvent[] {
    const filter = this.eventFilter();
    if (filter === 'all') return this.worldEvents();
    return this.worldEvents().filter(e => e.category === filter);
  }

  formatClock(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
