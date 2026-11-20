import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('integration', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
    server: true,
    env: { DISCORD_TOKEN: 'fixture-only', DISCORD_CLIENT_ID: '100000000000000001' },
  })

  describe('command collection', () => {
    it('should collect all commands from fixture', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const names = commands.map((c: any) => c.name)
      expect(names).toContain('ping')
      expect(names).toContain('add')
      expect(names).toContain('admin')
      expect(names).toContain('group')
    })

    it('should parse JSDoc body text as description', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const ping = commands.find((c: any) => c.name === 'ping')
      expect(ping.description).toBe('A simple ping command')
    })

    it('should parse command options with types', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const add = commands.find((c: any) => c.name === 'add')
      expect(add.options).toHaveLength(2)
      expect(add.options[0]).toMatchObject({
        name: 'a',
        type: 10, // ApplicationCommandOptionType.Number
        required: true,
        min: 0,
        max: 100,
      })
    })

    it('should parse @nsfw tag', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const admin = commands.find((c: any) => c.name === 'admin')
      expect(admin.nsfw).toBe(true)
    })

    it('should parse @guild with specific IDs', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const admin = commands.find((c: any) => c.name === 'admin')
      expect(admin.guilds).toEqual(['111111111111111111', '222222222222222222'])
    })

    it('should parse inline @name.ja localization', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const admin = commands.find((c: any) => c.name === 'admin')
      expect(admin.nameLocalizations.ja).toBe('管理者')
      expect(admin.descriptionLocalizations.ja).toBe('管理者専用コマンド')
    })

    it('should parse @defaultMemberPermissions', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const admin = commands.find((c: any) => c.name === 'admin')
      expect(admin.defaultMemberPermissions).toBe('8')
    })

    it('should parse User option type', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const group = commands.find((c: any) => c.name === 'group')
      expect(group.subcommands).toHaveLength(1)
      const sub = group.subcommands[0]
      expect(sub.name).toBe('sub')
      expect(sub.options[0]).toMatchObject({
        name: 'target',
        type: 6, // ApplicationCommandOptionType.User
      })
    })
  })

  describe('localization', () => {
    it('should apply name localizations from locale files', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const ping = commands.find((c: any) => c.name === 'ping')
      expect(ping.nameLocalizations).toEqual({ ja: 'ピング' })
    })

    it('should apply description localizations', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const ping = commands.find((c: any) => c.name === 'ping')
      expect(ping.descriptionLocalizations).toEqual({ ja: 'ポンと返す' })
    })

    it('should apply option localizations', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const add = commands.find((c: any) => c.name === 'add')
      expect(add.options[0].descriptionLocalizations).toEqual({ ja: '最初の数' })
    })
  })

  it.each([
    ['GET', '/discord'],
    ['GET', '/discord/slash-commands'],
    ['GET', '/api/discord/activity'],
    ['GET', '/api/discord/slash-command/all'],
    ['GET', '/api/discord/slash-command/remote-all'],
    ['POST', '/api/discord/slash-command/remote-diff'],
    ['POST', '/api/discord/slash-command/autocomplete'],
    ['POST', '/api/discord/slash-command/register'],
    ['POST', '/api/discord/slash-command/test'],
  ] as const)('omits %s %s in production', async (method, path) => {
    await expect($fetch(path, { method })).rejects.toMatchObject({ statusCode: 404 })
  })

  describe('subcommands', () => {
    it('should nest subcommands under parent', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const group = commands.find((c: any) => c.name === 'group')
      expect(group).toBeDefined()
      expect(group.subcommands).toHaveLength(1)
      expect(group.subcommands[0].name).toBe('sub')
    })

    it('should not include subcommands as top-level commands', async () => {
      const { commands } = await $fetch<{ commands: any[] }>('/api/fixture/commands')
      const names = commands.map((c: any) => c.name)
      expect(names).not.toContain('sub')
    })
  })
})
