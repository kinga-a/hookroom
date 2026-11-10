import { randomBytes } from 'node:crypto';

import { HttpError } from './errors.js';

export const MAX_GROUPS = 20;

export function createGroupId() {
  return `grp_${randomBytes(8).toString('hex')}`;
}

export function normalizeGroups(input, previousGroups = []) {
  if (input === undefined || input === null) {
    return (previousGroups ?? []).map((group) => ({ ...group }));
  }
  if (!Array.isArray(input)) throw new HttpError(400, '分组列表必须是数组');
  if (input.length > MAX_GROUPS) throw new HttpError(400, `最多只能创建 ${MAX_GROUPS} 个分组`);

  const previousById = new Map((previousGroups ?? []).map((group) => [group.id, group]));
  const usedIds = new Set();
  const usedNames = new Set();

  return input.map((item) => {
    if (!item || typeof item !== 'object') throw new HttpError(400, '分组数据格式不正确');
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 30) : '';
    if (!name) throw new HttpError(400, '分组名称不能为空');
    const nameKey = name.toLowerCase();
    if (usedNames.has(nameKey)) throw new HttpError(409, `分组「${name}」已存在`);
    usedNames.add(nameKey);

    let id = typeof item.id === 'string' && /^grp_[a-z0-9]{6,32}$/.test(item.id) ? item.id : createGroupId();
    if (usedIds.has(id)) id = createGroupId();
    usedIds.add(id);

    const previous = previousById.get(id);
    return {
      id,
      name,
      createdAt: typeof item.createdAt === 'string'
        ? item.createdAt
        : (previous?.createdAt ?? new Date().toISOString()),
    };
  });
}
