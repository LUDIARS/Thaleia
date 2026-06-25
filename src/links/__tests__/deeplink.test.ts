import { describe, it, expect } from 'vitest';
import {
  praeformaDomainUrl,
  praeformaSpecUrl,
  praeformaSceneUrl,
  anatomiaDomainUrl,
  anatomiaScreenUrl,
  domainRowLinks,
  sceneRowLinks,
} from '../deeplink.ts';

describe('praeformaDomainUrl', () => {
  it('points at the real route /projects/:pid with domains tab + focus', () => {
    expect(praeformaDomainUrl('http://localhost:5173', 'p1', 'Player Move')).toBe(
      'http://localhost:5173/projects/p1?tab=domains&focus=Player%20Move',
    );
  });
  it('trims trailing slash', () => {
    expect(praeformaDomainUrl('http://x/', 'p1', 'A')).toBe('http://x/projects/p1?tab=domains&focus=A');
  });
  it('returns null when web url is unset (no silent wrong link)', () => {
    expect(praeformaDomainUrl(null, 'p1', 'A')).toBeNull();
  });
  it('returns null when project id is empty', () => {
    expect(praeformaDomainUrl('http://x', '', 'A')).toBeNull();
  });
});

describe('praeformaSpecUrl', () => {
  it('uses the specs tab and encodes the spec code', () => {
    expect(praeformaSpecUrl('http://x', 'p1', 'SPEC-001')).toBe('http://x/projects/p1?tab=specs&focus=SPEC-001');
  });
});

describe('praeformaSceneUrl', () => {
  it('uses the layouts tab (scene = layout)', () => {
    expect(praeformaSceneUrl('http://x', 'p1', 'TitleScreen')).toBe('http://x/projects/p1?tab=layouts&focus=TitleScreen');
  });
});

describe('anatomiaDomainUrl', () => {
  it('opens the panel root with the real project param + focus', () => {
    expect(anatomiaDomainUrl('http://localhost:4200', 'ks', 'hp-bar')).toBe(
      'http://localhost:4200/?project=ks&focus=hp-bar',
    );
  });
  it('returns null without web url', () => {
    expect(anatomiaDomainUrl(null, 'ks', 'hp-bar')).toBeNull();
  });
});

describe('anatomiaScreenUrl', () => {
  it('opens the panel root focused on a screen', () => {
    expect(anatomiaScreenUrl('http://an', 'ks', 'Title')).toBe('http://an/?project=ks&focus=Title');
  });
});

describe('domainRowLinks', () => {
  const targets = { praeformaWebUrl: 'http://pf', anatomiaWebUrl: 'http://an' };

  it('matched row links to both sides', () => {
    expect(domainRowLinks(targets, 'p1', 'ks', { pfDomain: 'Player', anatomiaDomain: 'player' })).toEqual({
      praeforma: 'http://pf/projects/p1?tab=domains&focus=Player',
      anatomia: 'http://an/?project=ks&focus=player',
    });
  });
  it('spec-only row has Praeforma link only (no impl side)', () => {
    const l = domainRowLinks(targets, 'p1', 'ks', { pfDomain: 'Inventory', anatomiaDomain: null });
    expect(l.praeforma).toContain('Inventory');
    expect(l.anatomia).toBeNull();
  });
  it('code-only row has Anatomia link only (no spec side)', () => {
    const l = domainRowLinks(targets, 'p1', 'ks', { pfDomain: null, anatomiaDomain: 'hp-bar' });
    expect(l.praeforma).toBeNull();
    expect(l.anatomia).toContain('hp-bar');
  });
  it('omits links for the side whose web url is unset', () => {
    const l = domainRowLinks({ praeformaWebUrl: null, anatomiaWebUrl: 'http://an' }, 'p1', 'ks', {
      pfDomain: 'Player',
      anatomiaDomain: 'player',
    });
    expect(l.praeforma).toBeNull();
    expect(l.anatomia).not.toBeNull();
  });
});

describe('sceneRowLinks', () => {
  const targets = { praeformaWebUrl: 'http://pf', anatomiaWebUrl: 'http://an' };

  it('links each present side (scene → Praeforma layouts, screen → Anatomia)', () => {
    expect(sceneRowLinks(targets, 'p1', 'ks', { pfScene: 'Title', anatomiaScreen: 'title' })).toEqual({
      praeforma: 'http://pf/projects/p1?tab=layouts&focus=Title',
      anatomia: 'http://an/?project=ks&focus=title',
    });
  });
  it('spec-only scene has Praeforma link only', () => {
    const l = sceneRowLinks(targets, 'p1', 'ks', { pfScene: 'Title', anatomiaScreen: null });
    expect(l.praeforma).toContain('layouts');
    expect(l.anatomia).toBeNull();
  });
});
