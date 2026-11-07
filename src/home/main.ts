// 首页：列出所有小游戏和它们的进度。
import { games, type GameStatus } from '../games/list.ts';
import './style.css';

const statusClass: Record<GameStatus, string> = {
  候选: 'idea',
  原型: 'proto',
  打磨中: 'polish',
  已上线: 'live',
  搁置: 'shelved',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const list = document.getElementById('games');
if (list) {
  games.forEach((g, i) => {
    const card = el(g.path ? 'a' : 'div', 'card');
    if (g.path && card instanceof HTMLAnchorElement) card.href = g.path;
    const head = el('div', 'card-head');
    head.append(el('span', 'card-num', String(i + 1)), el('h3', 'card-name', g.name));
    head.append(el('span', `pill pill-${statusClass[g.status]}`, g.status));
    card.append(head, el('p', 'card-pitch', g.pitch));
    if (g.path) card.append(el('span', 'card-go', '去玩 →'));
    list.append(card);
  });
}

const build = document.getElementById('build');
if (build) build.textContent = `版本 ${__BUILD__.version} · ${__BUILD__.date}`;
