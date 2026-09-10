export function createLineCollector(onLine) {
  let pending = '';

  return {
    write(chunk) {
      pending += String(chunk);
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? '';
      for (const line of lines) onLine(line);
    },
    flush() {
      if (pending !== '') onLine(pending);
      pending = '';
    },
  };
}

export function waitForStartup(child, events, getOutput, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (operation, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      events.off('ready', onReady);
      events.off('failure', onFailure);
      child.off('error', onError);
      child.off('exit', onExit);
      operation(value);
    };

    const onReady = (url) => finish(resolve, url);
    const onFailure = (error) => finish(reject, error);
    const onError = (error) => {
      finish(reject, new Error(`Die Anwendung ließ sich nicht starten: ${error.message}`));
    };
    const onExit = (code, signal) => {
      const reason =
        signal === null
          ? `Code ${String(code)}`
          : `Signal ${signal}${code === null ? '' : ` (Code ${String(code)})`}`;
      finish(
        reject,
        new Error(`Die Anwendung endete vor dem Start mit ${reason}.\n\n${getOutput()}`),
      );
    };
    const timer = setTimeout(() => {
      finish(reject, new Error(`Keine Adresse nach ${String(timeoutMs)} ms.\n\n${getOutput()}`));
    }, timeoutMs);

    events.once('ready', onReady);
    events.once('failure', onFailure);
    child.once('error', onError);
    child.once('exit', onExit);

    if (child.exitCode !== null || child.signalCode !== null) {
      onExit(child.exitCode, child.signalCode);
    }
  });
}

export async function stopChild(child, graceMs = 10_000) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;

  await new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off('exit', done);
      resolve();
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, graceMs);

    child.once('exit', done);
    if (!child.kill('SIGTERM')) done();
  });
}
