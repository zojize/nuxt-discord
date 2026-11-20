// The two commands share one executor per user and pool, like the example gacha bot.
export class Executor {
  count = 0

  pull(amount: number) {
    this.count += amount
    return this.count
  }
}
