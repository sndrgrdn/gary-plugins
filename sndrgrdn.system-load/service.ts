import { Effect, Schedule, Schema, host } from "gary:effect";

class CommandFailed extends Schema.TaggedError<CommandFailed>()("CommandFailed", { message: Schema.String }) {}

const Count = Schema.NumberFromString;
const VmStat = Schema.Struct({
  "page size": Count,
  "Anonymous pages": Count,
  "Pages purgeable": Count,
  "Pages wired down": Count,
  "Pages occupied by compressor": Count,
});
const samples = 30;
let cpu: number[] = [];
let memory = 0;

const run = Effect.fn("SystemLoad.run")(function* (...argv: string[]) {
  const result = yield* host.exec(argv);
  if (result.status !== 0) return yield* new CommandFailed({ message: `${argv[0]}: ${result.stderr.trim()}` });
  return result.stdout.trim();
});

function vmStatFields(text: string) {
  const fields: Record<string, string | undefined> = { "page size": /page size of (\d+) bytes/.exec(text)?.[1] };
  for (const line of text.split("\n")) {
    const match = /^"?([^":]+)"?:\s+(\d+)\.$/.exec(line);
    if (match) fields[match[1]] = match[2];
  }
  return fields;
}

const sample = Effect.fn("SystemLoad.sample")(function* (total: number) {
  const [iostat, vmStat] = yield* Effect.all([run("/usr/sbin/iostat", "-n0", "-c2", "-w2"), run("/usr/bin/vm_stat")], {
    concurrency: "unbounded",
  });
  const idle = yield* Schema.decodeUnknownEffect(Count)(iostat.split("\n").at(-1)?.trim().split(/\s+/)[2]);
  const pages = yield* Schema.decodeUnknownEffect(VmStat)(vmStatFields(vmStat));
  const used = pages["Anonymous pages"] - pages["Pages purgeable"] + pages["Pages wired down"] + pages["Pages occupied by compressor"];
  cpu = [...cpu, 100 - idle].slice(-samples);
  memory = Math.round((100 * used * pages["page size"]) / total);
  yield* host.publish({ cpu, memory });
});

export default {
  effect: Effect.gen(function* () {
    const total = yield* Schema.decodeUnknownEffect(Count)(yield* run("/usr/sbin/sysctl", "-n", "hw.memsize"));
    yield* sample(total).pipe(
      Effect.tapError((error) => host.log(`sample failed: ${error.message}`)),
      Effect.ignore,
      Effect.repeat(Schedule.fixed("2 seconds")),
    );
  }),

  methods: {
    state: () => ({ cpu, memory }),
  },
} satisfies Gary.Service;
