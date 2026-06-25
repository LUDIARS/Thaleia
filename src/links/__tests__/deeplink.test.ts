import { describe, it, expect } from 'vitest';
import {
  praeformaDomainUrl,
  praeformaSpecUrl,
  anatomiaDomainUrl,
  domainRowLinks,
} from '../deeplink.ts';

describe('praeformaDomainUrl', () => {
  it('builds a focus URL and encodes the domain', () => {
    expect(praeformaDomainUrl('http://localhost:5173', 'p1', 'Player Move')).toBe(
      'http://localhost:5173/projects/p1?focus=domain%3APlayer%20Move',
    );
  });
  it('trims trailing slash', () => {
    expect(praeformaDomainUrl('http://x/', 'p1', 'A')).toBe('http://x/projects/p1?focus=domain%3AA');
  });
  it('returns null when web url is unset (no silent wrong link)', () => {
    expect(praeformaDomainUrl(null, 'p1', 'A')).toBeNull();
  });
  it('returns null when project id is empty', () => {
    expect(praeformaDomainUrl('http://x', '', 'A')).toBeNull();
  });
});

describe('praeformaSpecUrl', () => {
  it('encodes the spec code', () => {
    expect(praeformaSpecUrl('http://x', 'p1', 'SPEC-001')).toBe('http://x/projects/p1?focus=spec%3ASPEC-001');
  });
});

describe('anatomiaDomainUrl', () => {
  it('passes project + domain as query', () => {
    expect(anatomiaDomainUrl('http://localhost:4200', 'ks', 'hp-bar')).toBe(
      'http://localhost:4200/?project=ks&domain=hp-bar',
    );
  });
  it('returns null without web url', () => {
    expect(anatomiaDomainUrl(null, 'ks', 'hp-bar')).toBeNull();
  });
});

describe('domainRowLinks', () => {
  const targets = { praeformaWebUrl: 'http://pf', anatomiaWebUrl: 'http://an' };

  it('matched row links to both sides', () => {
    expect(domainRowLinks(targets, 'p1', 'ks', { pfDomain: 'Player', anatomiaDomain: 'player' })).toEqual({
      praeforma: 'http://pf/projects/p1?focus=domain%3APlayer',
      anatomia: 'http://an/?project=ks&domain=player',
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
