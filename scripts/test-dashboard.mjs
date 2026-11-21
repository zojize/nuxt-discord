import assert from 'node:assert/strict'
import { demoSuggestions, playableNames, runDemo } from '../docs/utils/demo-commands.ts'

export async function checkDashboardCommands(baseURL) {
  async function post(route, body) {
    const response = await fetch(new URL(`/api/discord/slash-command/${route}`, baseURL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    assert.equal(response.status, 200, await response.clone().text())
    return response.json()
  }
  const run = (name, options = {}) => post('test', { name, options })
  const suggest = (command, option, value) => post('autocomplete', { command, option, value })

  const samples = {
    ping: [{}],
    add: [{ a: '-2', b: '3.5' }],
    reverse: [{ input: 'Nuxt!' }],
    greet: ['formal', 'casual', 'enthusiastic'].map(style => ({ name: 'Ada', style })),
  }
  assert.deepEqual(Object.keys(samples).sort(), [...playableNames].sort())
  for (const [name, cases] of Object.entries(samples)) {
    for (const options of cases) {
      const expected = runDemo({ name, options })
      const actual = await run(name, options)
      assert.equal(actual.ok, true, actual.error)
      assert.deepEqual(actual.replies, [{ content: expected.response, ephemeral: expected.ephemeral ?? false }])
    }
  }
  assert.deepEqual(await suggest('greet', 'name', 'A'), demoSuggestions('greet', 'name', 'A'))
  assert.deepEqual(await suggest('group nested search', 'query', 'Ne'), [{ name: 'Ne result', value: 'Ne' }])

  const denied = await run('owner')
  assert.equal(denied.ok, false)
  assert.match(denied.error, /owner/i)
  const counter = await run('counter')
  assert.equal(counter.ok, true, counter.error)
  assert.equal(counter.response, 'Count: 0')
  assert.match(counter.notices.join(' '), /controls.*Discord/)
  for (const [name, options, expected] of [
    ['feedback', {}, /modal.*Discord/i],
    ['userinfo', { user: 'someone' }, /Discord user/i],
  ]) {
    const actual = await run(name, options)
    assert.equal(actual.ok, false)
    assert.match(actual.error, expected)
  }
  const sequence = await run('sequence')
  assert.deepEqual(sequence.replies, [
    { content: 'First', ephemeral: false },
    { content: 'Private follow-up', ephemeral: true },
  ])
}
