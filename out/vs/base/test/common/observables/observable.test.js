import assert from "assert";
import { setUnexpectedErrorHandler } from "../../../common/errors.js";
import { Emitter, Event } from "../../../common/event.js";
import { DisposableStore, toDisposable } from "../../../common/lifecycle.js";
import { autorun, autorunHandleChanges, autorunPerKeyedItem, autorunWithStoreHandleChanges, derived, derivedDisposable, keepObserved, observableFromEvent, observableSignal, observableValue, recordChanges, transaction, waitForState, derivedHandleChanges, runOnChange, DebugLocation } from "../../../common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../utils.js";
import { observableReducer } from "../../../common/observableInternal/experimental/reducer.js";
import { BaseObservable } from "../../../common/observableInternal/observables/baseObservable.js";
suite("observables", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  suite("tutorial", () => {
    test("observable + autorun", () => {
      const log = new Log();
      const myObservable = observableValue("myObservable", 0);
      ds.add(autorun((reader) => {
        log.log(`myAutorun.run(myObservable: ${myObservable.read(reader)})`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), ["myAutorun.run(myObservable: 0)"]);
      myObservable.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), ["myAutorun.run(myObservable: 1)"]);
      myObservable.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      transaction((tx) => {
        myObservable.set(2, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        myObservable.set(3, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), ["myAutorun.run(myObservable: 3)"]);
    });
    test("derived + autorun", () => {
      const log = new Log();
      const observable1 = observableValue("myObservable1", 0);
      const observable2 = observableValue("myObservable2", 0);
      const myDerived = derived((reader) => {
        const value1 = observable1.read(reader);
        const value2 = observable2.read(reader);
        const sum = value1 + value2;
        log.log(`myDerived.recompute: ${value1} + ${value2} = ${sum}`);
        return sum;
      });
      ds.add(autorun((reader) => {
        log.log(`myAutorun(myDerived: ${myDerived.read(reader)})`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.recompute: 0 + 0 = 0",
        "myAutorun(myDerived: 0)"
      ]);
      observable1.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.recompute: 1 + 0 = 1",
        "myAutorun(myDerived: 1)"
      ]);
      observable2.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.recompute: 1 + 1 = 2",
        "myAutorun(myDerived: 2)"
      ]);
      transaction((tx) => {
        observable1.set(5, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        observable2.set(5, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.recompute: 5 + 5 = 10",
        "myAutorun(myDerived: 10)"
      ]);
      transaction((tx) => {
        observable1.set(6, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        observable2.set(4, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), ["myDerived.recompute: 6 + 4 = 10"]);
    });
    test("read during transaction", () => {
      const log = new Log();
      const observable1 = observableValue("myObservable1", 0);
      const observable2 = observableValue("myObservable2", 0);
      const myDerived = derived((reader) => {
        const value1 = observable1.read(reader);
        const value2 = observable2.read(reader);
        const sum = value1 + value2;
        log.log(`myDerived.recompute: ${value1} + ${value2} = ${sum}`);
        return sum;
      });
      ds.add(autorun((reader) => {
        log.log(`myAutorun(myDerived: ${myDerived.read(reader)})`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.recompute: 0 + 0 = 0",
        "myAutorun(myDerived: 0)"
      ]);
      transaction((tx) => {
        observable1.set(-10, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        myDerived.get();
        assert.deepStrictEqual(log.getAndClearEntries(), ["myDerived.recompute: -10 + 0 = -10"]);
        observable2.set(10, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.recompute: -10 + 10 = 0",
        "myAutorun(myDerived: 0)"
      ]);
    });
    test("get without observers", () => {
      const log = new Log();
      const observable1 = observableValue("myObservableValue1", 0);
      const computed1 = derived((reader) => {
        const value1 = observable1.read(reader);
        const result = value1 % 3;
        log.log(`recompute1: ${value1} % 3 = ${result}`);
        return result;
      });
      const computed2 = derived((reader) => {
        const value1 = computed1.read(reader);
        const result = value1 * 2;
        log.log(`recompute2: ${value1} * 2 = ${result}`);
        return result;
      });
      const computed3 = derived((reader) => {
        const value1 = computed1.read(reader);
        const result = value1 * 3;
        log.log(`recompute3: ${value1} * 3 = ${result}`);
        return result;
      });
      const computedSum = derived((reader) => {
        const value1 = computed2.read(reader);
        const value2 = computed3.read(reader);
        const result = value1 + value2;
        log.log(`recompute4: ${value1} + ${value2} = ${result}`);
        return result;
      });
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      observable1.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "recompute1: 1 % 3 = 1",
        "recompute2: 1 * 2 = 2",
        "recompute3: 1 * 3 = 3",
        "recompute4: 2 + 3 = 5",
        "value: 5"
      ]);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "recompute1: 1 % 3 = 1",
        "recompute2: 1 * 2 = 2",
        "recompute3: 1 * 3 = 3",
        "recompute4: 2 + 3 = 5",
        "value: 5"
      ]);
      const disposable = keepObserved(computedSum);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "recompute1: 1 % 3 = 1",
        "recompute2: 1 * 2 = 2",
        "recompute3: 1 * 3 = 3",
        "recompute4: 2 + 3 = 5",
        "value: 5"
      ]);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "value: 5"
      ]);
      observable1.set(2, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "recompute1: 2 % 3 = 2",
        "recompute2: 2 * 2 = 4",
        "recompute3: 2 * 3 = 6",
        "recompute4: 4 + 6 = 10",
        "value: 10"
      ]);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), ["value: 10"]);
      disposable.dispose();
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "recompute1: 2 % 3 = 2",
        "recompute2: 2 * 2 = 4",
        "recompute3: 2 * 3 = 6",
        "recompute4: 4 + 6 = 10",
        "value: 10"
      ]);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "recompute1: 2 % 3 = 2",
        "recompute2: 2 * 2 = 4",
        "recompute3: 2 * 3 = 6",
        "recompute4: 4 + 6 = 10",
        "value: 10"
      ]);
    });
    test("autorun that receives deltas of signals", () => {
      const log = new Log();
      const signal = observableSignal("signal");
      const disposable = autorunHandleChanges({
        changeTracker: {
          // The change summary is used to collect the changes
          createChangeSummary: () => ({ msgs: [] }),
          handleChange(context, changeSummary) {
            if (context.didChange(signal)) {
              changeSummary.msgs.push(context.change.msg);
            }
            return true;
          }
        }
      }, (reader, changeSummary) => {
        signal.read(reader);
        log.log("msgs: " + changeSummary.msgs.join(", "));
      });
      signal.trigger(void 0, { msg: "foobar" });
      transaction((tx) => {
        signal.trigger(tx, { msg: "hello" });
        signal.trigger(tx, { msg: "world" });
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "msgs: ",
        "msgs: foobar",
        "msgs: hello, world"
      ]);
      disposable.dispose();
    });
  });
  test("topological order", () => {
    const log = new Log();
    const myObservable1 = observableValue("myObservable1", 0);
    const myObservable2 = observableValue("myObservable2", 0);
    const myComputed1 = derived((reader) => {
      const value1 = myObservable1.read(reader);
      const value2 = myObservable2.read(reader);
      const sum = value1 + value2;
      log.log(`myComputed1.recompute(myObservable1: ${value1} + myObservable2: ${value2} = ${sum})`);
      return sum;
    });
    const myComputed2 = derived((reader) => {
      const value1 = myComputed1.read(reader);
      const value2 = myObservable1.read(reader);
      const value3 = myObservable2.read(reader);
      const sum = value1 + value2 + value3;
      log.log(`myComputed2.recompute(myComputed1: ${value1} + myObservable1: ${value2} + myObservable2: ${value3} = ${sum})`);
      return sum;
    });
    const myComputed3 = derived((reader) => {
      const value1 = myComputed2.read(reader);
      const value2 = myObservable1.read(reader);
      const value3 = myObservable2.read(reader);
      const sum = value1 + value2 + value3;
      log.log(`myComputed3.recompute(myComputed2: ${value1} + myObservable1: ${value2} + myObservable2: ${value3} = ${sum})`);
      return sum;
    });
    ds.add(autorun((reader) => {
      log.log(`myAutorun.run(myComputed3: ${myComputed3.read(reader)})`);
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myComputed1.recompute(myObservable1: 0 + myObservable2: 0 = 0)",
      "myComputed2.recompute(myComputed1: 0 + myObservable1: 0 + myObservable2: 0 = 0)",
      "myComputed3.recompute(myComputed2: 0 + myObservable1: 0 + myObservable2: 0 = 0)",
      "myAutorun.run(myComputed3: 0)"
    ]);
    myObservable1.set(1, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myComputed1.recompute(myObservable1: 1 + myObservable2: 0 = 1)",
      "myComputed2.recompute(myComputed1: 1 + myObservable1: 1 + myObservable2: 0 = 2)",
      "myComputed3.recompute(myComputed2: 2 + myObservable1: 1 + myObservable2: 0 = 3)",
      "myAutorun.run(myComputed3: 3)"
    ]);
    transaction((tx) => {
      myObservable1.set(2, tx);
      myComputed2.get();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myComputed1.recompute(myObservable1: 2 + myObservable2: 0 = 2)",
        "myComputed2.recompute(myComputed1: 2 + myObservable1: 2 + myObservable2: 0 = 4)"
      ]);
      myObservable1.set(3, tx);
      myComputed2.get();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myComputed1.recompute(myObservable1: 3 + myObservable2: 0 = 3)",
        "myComputed2.recompute(myComputed1: 3 + myObservable1: 3 + myObservable2: 0 = 6)"
      ]);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myComputed3.recompute(myComputed2: 6 + myObservable1: 3 + myObservable2: 0 = 9)",
      "myAutorun.run(myComputed3: 9)"
    ]);
  });
  suite("from event", () => {
    function init() {
      const log = new Log();
      let value = 0;
      const eventEmitter = new Emitter();
      let id = 0;
      const observable = observableFromEvent(
        (handler) => {
          const curId = id++;
          log.log(`subscribed handler ${curId}`);
          const disposable = eventEmitter.event(handler);
          return {
            dispose: () => {
              log.log(`unsubscribed handler ${curId}`);
              disposable.dispose();
            }
          };
        },
        () => {
          log.log(`compute value ${value}`);
          return value;
        }
      );
      return {
        log,
        setValue: (newValue) => {
          value = newValue;
          eventEmitter.fire();
        },
        observable
      };
    }
    test("Handle undefined", () => {
      const { log, setValue, observable } = init();
      setValue(void 0);
      const autorunDisposable = autorun((reader) => {
        observable.read(reader);
        log.log(
          `autorun, value: ${observable.read(reader)}`
        );
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "subscribed handler 0",
        "compute value undefined",
        "autorun, value: undefined"
      ]);
      setValue(1);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "compute value 1",
        "autorun, value: 1"
      ]);
      autorunDisposable.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "unsubscribed handler 0"
      ]);
    });
    test("basic", () => {
      const { log, setValue, observable } = init();
      const shouldReadObservable = observableValue("shouldReadObservable", true);
      const autorunDisposable = autorun((reader) => {
        if (shouldReadObservable.read(reader)) {
          observable.read(reader);
          log.log(
            `autorun, should read: true, value: ${observable.read(reader)}`
          );
        } else {
          log.log(`autorun, should read: false`);
        }
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "subscribed handler 0",
        "compute value 0",
        "autorun, should read: true, value: 0"
      ]);
      log.log(`get value: ${observable.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), ["get value: 0"]);
      setValue(1);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "compute value 1",
        "autorun, should read: true, value: 1"
      ]);
      shouldReadObservable.set(false, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "autorun, should read: false",
        "unsubscribed handler 0"
      ]);
      shouldReadObservable.set(true, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "subscribed handler 1",
        "compute value 1",
        "autorun, should read: true, value: 1"
      ]);
      autorunDisposable.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "unsubscribed handler 1"
      ]);
    });
    test("get without observers", () => {
      const { log, observable } = init();
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      log.log(`get value: ${observable.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "compute value 0",
        "get value: 0"
      ]);
      log.log(`get value: ${observable.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "compute value 0",
        "get value: 0"
      ]);
    });
    test("last observer removed while handling event", () => {
      const { log, setValue, observable } = init();
      let firstValue;
      const firstObserver = autorun((reader) => {
        firstValue = observable.read(reader);
        if (firstValue === 1) {
          firstObserver.dispose();
        }
      });
      assert.deepStrictEqual({ firstValue, log: log.getAndClearEntries() }, {
        firstValue: 0,
        log: [
          "subscribed handler 0",
          "compute value 0"
        ]
      });
      setValue(1);
      assert.deepStrictEqual({ firstValue, log: log.getAndClearEntries() }, {
        firstValue: 1,
        log: [
          "compute value 1",
          "unsubscribed handler 0"
        ]
      });
      let secondValue;
      const secondObserver = autorun((reader) => {
        secondValue = observable.read(reader);
      });
      assert.deepStrictEqual({ secondValue, log: log.getAndClearEntries() }, {
        secondValue: 1,
        log: [
          "subscribed handler 1",
          "compute value 1"
        ]
      });
      secondObserver.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), ["unsubscribed handler 1"]);
    });
  });
  test("reading derived in transaction unsubscribes unnecessary observables", () => {
    const log = new Log();
    const shouldReadObservable = observableValue("shouldReadMyObs1", true);
    const myObs1 = new LoggingObservableValue("myObs1", 0, log);
    const myComputed = derived((reader) => {
      log.log("myComputed.recompute");
      if (shouldReadObservable.read(reader)) {
        return myObs1.read(reader);
      }
      return 1;
    });
    ds.add(autorun((reader) => {
      const value = myComputed.read(reader);
      log.log(`myAutorun: ${value}`);
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myComputed.recompute",
      "myObs1.firstObserverAdded",
      "myObs1.get",
      "myAutorun: 0"
    ]);
    transaction((tx) => {
      myObs1.set(1, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), ["myObs1.set (value 1)"]);
      shouldReadObservable.set(false, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      myComputed.get();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myComputed.recompute",
        "myObs1.lastObserverRemoved"
      ]);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), ["myAutorun: 1"]);
  });
  test("avoid recomputation of deriveds that are no longer read", () => {
    const log = new Log();
    const myObsShouldRead = new LoggingObservableValue("myObsShouldRead", true, log);
    const myObs1 = new LoggingObservableValue("myObs1", 0, log);
    const myComputed1 = derived((reader) => {
      const myObs1Val = myObs1.read(reader);
      const result = myObs1Val % 10;
      log.log(`myComputed1(myObs1: ${myObs1Val}): Computed ${result}`);
      return myObs1Val;
    });
    ds.add(autorun((reader) => {
      const shouldRead = myObsShouldRead.read(reader);
      if (shouldRead) {
        const v = myComputed1.read(reader);
        log.log(`myAutorun(shouldRead: true, myComputed1: ${v}): run`);
      } else {
        log.log(`myAutorun(shouldRead: false): run`);
      }
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObsShouldRead.firstObserverAdded",
      "myObsShouldRead.get",
      "myObs1.firstObserverAdded",
      "myObs1.get",
      "myComputed1(myObs1: 0): Computed 0",
      "myAutorun(shouldRead: true, myComputed1: 0): run"
    ]);
    transaction((tx) => {
      myObsShouldRead.set(false, tx);
      myObs1.set(1, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObsShouldRead.set (value false)",
        "myObs1.set (value 1)"
      ]);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObsShouldRead.get",
      "myAutorun(shouldRead: false): run",
      "myObs1.lastObserverRemoved"
    ]);
    transaction((tx) => {
      myObsShouldRead.set(true, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObsShouldRead.set (value true)"
      ]);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObsShouldRead.get",
      "myObs1.firstObserverAdded",
      "myObs1.get",
      "myComputed1(myObs1: 1): Computed 1",
      "myAutorun(shouldRead: true, myComputed1: 1): run"
    ]);
  });
  suite("autorun rerun on neutral change", () => {
    test("autorun reruns on neutral observable double change", () => {
      const log = new Log();
      const myObservable = observableValue("myObservable", 0);
      ds.add(autorun((reader) => {
        log.log(`myAutorun.run(myObservable: ${myObservable.read(reader)})`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), ["myAutorun.run(myObservable: 0)"]);
      transaction((tx) => {
        myObservable.set(2, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        myObservable.set(0, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), ["myAutorun.run(myObservable: 0)"]);
    });
    test("autorun does not rerun on indirect neutral observable double change", () => {
      const log = new Log();
      const myObservable = observableValue("myObservable", 0);
      const myDerived = derived((reader) => {
        const val = myObservable.read(reader);
        log.log(`myDerived.read(myObservable: ${val})`);
        return val;
      });
      ds.add(autorun((reader) => {
        log.log(`myAutorun.run(myDerived: ${myDerived.read(reader)})`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.read(myObservable: 0)",
        "myAutorun.run(myDerived: 0)"
      ]);
      transaction((tx) => {
        myObservable.set(2, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        myObservable.set(0, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.read(myObservable: 0)"
      ]);
    });
    test("autorun reruns on indirect neutral observable double change when changes propagate", () => {
      const log = new Log();
      const myObservable = observableValue("myObservable", 0);
      const myDerived = derived((reader) => {
        const val = myObservable.read(reader);
        log.log(`myDerived.read(myObservable: ${val})`);
        return val;
      });
      ds.add(autorun((reader) => {
        log.log(`myAutorun.run(myDerived: ${myDerived.read(reader)})`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.read(myObservable: 0)",
        "myAutorun.run(myDerived: 0)"
      ]);
      transaction((tx) => {
        myObservable.set(2, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        myDerived.get();
        assert.deepStrictEqual(log.getAndClearEntries(), [
          "myDerived.read(myObservable: 2)"
        ]);
        myObservable.set(0, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.read(myObservable: 0)",
        "myAutorun.run(myDerived: 0)"
      ]);
    });
  });
  test("self-disposing autorun", () => {
    const log = new Log();
    const observable1 = new LoggingObservableValue("myObservable1", 0, log);
    const myObservable2 = new LoggingObservableValue("myObservable2", 0, log);
    const myObservable3 = new LoggingObservableValue("myObservable3", 0, log);
    const d = autorun((reader) => {
      if (observable1.read(reader) >= 2) {
        assert.deepStrictEqual(log.getAndClearEntries(), [
          "myObservable1.set (value 2)",
          "myObservable1.get"
        ]);
        myObservable2.read(reader);
        assert.deepStrictEqual(log.getAndClearEntries(), [
          "myObservable2.firstObserverAdded",
          "myObservable2.get"
        ]);
        d.dispose();
        assert.deepStrictEqual(log.getAndClearEntries(), [
          "myObservable1.lastObserverRemoved",
          "myObservable2.lastObserverRemoved"
        ]);
        myObservable3.read(reader);
        assert.deepStrictEqual(log.getAndClearEntries(), [
          "myObservable3.get"
        ]);
      }
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable1.firstObserverAdded",
      "myObservable1.get"
    ]);
    observable1.set(1, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable1.set (value 1)",
      "myObservable1.get"
    ]);
    observable1.set(2, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), []);
  });
  test("changing observables in endUpdate", () => {
    const log = new Log();
    const myObservable1 = new LoggingObservableValue("myObservable1", 0, log);
    const myObservable2 = new LoggingObservableValue("myObservable2", 0, log);
    const myDerived1 = derived((reader) => {
      const val = myObservable1.read(reader);
      log.log(`myDerived1.read(myObservable: ${val})`);
      return val;
    });
    const myDerived2 = derived((reader) => {
      const val = myObservable2.read(reader);
      if (val === 1) {
        myDerived1.read(reader);
      }
      log.log(`myDerived2.read(myObservable: ${val})`);
      return val;
    });
    ds.add(autorun((reader) => {
      const myDerived1Val = myDerived1.read(reader);
      const myDerived2Val = myDerived2.read(reader);
      log.log(`myAutorun.run(myDerived1: ${myDerived1Val}, myDerived2: ${myDerived2Val})`);
    }));
    transaction((tx) => {
      myObservable2.set(1, tx);
      myObservable1.set(1, tx);
    });
  });
  test("set dependency in derived", () => {
    const log = new Log();
    const myObservable = new LoggingObservableValue("myObservable", 0, log);
    const myComputed = derived((reader) => {
      let value = myObservable.read(reader);
      const origValue = value;
      log.log(`myComputed(myObservable: ${origValue}): start computing`);
      if (value % 3 !== 0) {
        value++;
        myObservable.set(value, void 0);
      }
      log.log(`myComputed(myObservable: ${origValue}): finished computing`);
      return value;
    });
    ds.add(autorun((reader) => {
      const value = myComputed.read(reader);
      log.log(`myAutorun(myComputed: ${value})`);
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.firstObserverAdded",
      "myObservable.get",
      "myComputed(myObservable: 0): start computing",
      "myComputed(myObservable: 0): finished computing",
      "myAutorun(myComputed: 0)"
    ]);
    myObservable.set(1, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.set (value 1)",
      "myObservable.get",
      "myComputed(myObservable: 1): start computing",
      "myObservable.set (value 2)",
      "myComputed(myObservable: 1): finished computing",
      "myObservable.get",
      "myComputed(myObservable: 2): start computing",
      "myObservable.set (value 3)",
      "myComputed(myObservable: 2): finished computing",
      "myObservable.get",
      "myComputed(myObservable: 3): start computing",
      "myComputed(myObservable: 3): finished computing",
      "myAutorun(myComputed: 3)"
    ]);
  });
  test("set dependency in autorun", () => {
    const log = new Log();
    const myObservable = new LoggingObservableValue("myObservable", 0, log);
    ds.add(autorun((reader) => {
      const value = myObservable.read(reader);
      log.log(`myAutorun(myObservable: ${value}): start`);
      if (value !== 0 && value < 4) {
        myObservable.set(value + 1, void 0);
      }
      log.log(`myAutorun(myObservable: ${value}): end`);
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.firstObserverAdded",
      "myObservable.get",
      "myAutorun(myObservable: 0): start",
      "myAutorun(myObservable: 0): end"
    ]);
    myObservable.set(1, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.set (value 1)",
      "myObservable.get",
      "myAutorun(myObservable: 1): start",
      "myObservable.set (value 2)",
      "myAutorun(myObservable: 1): end",
      "myObservable.get",
      "myAutorun(myObservable: 2): start",
      "myObservable.set (value 3)",
      "myAutorun(myObservable: 2): end",
      "myObservable.get",
      "myAutorun(myObservable: 3): start",
      "myObservable.set (value 4)",
      "myAutorun(myObservable: 3): end",
      "myObservable.get",
      "myAutorun(myObservable: 4): start",
      "myAutorun(myObservable: 4): end"
    ]);
  });
  test("get in transaction between sets", () => {
    const log = new Log();
    const myObservable = new LoggingObservableValue("myObservable", 0, log);
    const myDerived1 = derived((reader) => {
      const value = myObservable.read(reader);
      log.log(`myDerived1(myObservable: ${value}): start computing`);
      return value;
    });
    const myDerived2 = derived((reader) => {
      const value = myDerived1.read(reader);
      log.log(`myDerived2(myDerived1: ${value}): start computing`);
      return value;
    });
    ds.add(autorun((reader) => {
      const value = myDerived2.read(reader);
      log.log(`myAutorun(myDerived2: ${value})`);
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.firstObserverAdded",
      "myObservable.get",
      "myDerived1(myObservable: 0): start computing",
      "myDerived2(myDerived1: 0): start computing",
      "myAutorun(myDerived2: 0)"
    ]);
    transaction((tx) => {
      myObservable.set(1, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value 1)"
      ]);
      myDerived2.get();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.get",
        "myDerived1(myObservable: 1): start computing",
        "myDerived2(myDerived1: 1): start computing"
      ]);
      myObservable.set(2, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value 2)"
      ]);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.get",
      "myDerived1(myObservable: 2): start computing",
      "myDerived2(myDerived1: 2): start computing",
      "myAutorun(myDerived2: 2)"
    ]);
  });
  test("bug: Dont reset states", () => {
    const log = new Log();
    const myObservable1 = new LoggingObservableValue("myObservable1", 0, log);
    const myObservable2 = new LoggingObservableValue("myObservable2", 0, log);
    const myDerived2 = derived((reader) => {
      const val = myObservable2.read(reader);
      log.log(`myDerived2.computed(myObservable2: ${val})`);
      return val % 10;
    });
    const myDerived3 = derived((reader) => {
      const val1 = myObservable1.read(reader);
      const val2 = myDerived2.read(reader);
      log.log(`myDerived3.computed(myDerived1: ${val1}, myDerived2: ${val2})`);
      return `${val1} + ${val2}`;
    });
    ds.add(autorun((reader) => {
      const val = myDerived3.read(reader);
      log.log(`myAutorun(myDerived3: ${val})`);
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable1.firstObserverAdded",
      "myObservable1.get",
      "myObservable2.firstObserverAdded",
      "myObservable2.get",
      "myDerived2.computed(myObservable2: 0)",
      "myDerived3.computed(myDerived1: 0, myDerived2: 0)",
      "myAutorun(myDerived3: 0 + 0)"
    ]);
    transaction((tx) => {
      myObservable1.set(1, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable1.set (value 1)"
      ]);
      myObservable2.set(10, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable2.set (value 10)"
      ]);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable1.get",
      "myObservable2.get",
      "myDerived2.computed(myObservable2: 10)",
      "myDerived3.computed(myDerived1: 1, myDerived2: 0)",
      "myAutorun(myDerived3: 1 + 0)"
    ]);
  });
  test("bug: Add observable in endUpdate", () => {
    const myObservable1 = observableValue("myObservable1", 0);
    const myObservable2 = observableValue("myObservable2", 0);
    const myDerived1 = derived((reader) => {
      return myObservable1.read(reader);
    });
    const myDerived2 = derived((reader) => {
      return myObservable2.read(reader);
    });
    const myDerivedA1 = derived((reader) => {
      const d1 = myDerived1.read(reader);
      if (d1 === 1) {
        myDerived2.read(reader);
      }
    });
    ds.add(autorun((reader) => {
      myDerivedA1.read(reader);
    }));
    ds.add(autorun((reader) => {
      myDerived2.read(reader);
    }));
    transaction((tx) => {
      myObservable1.set(1, tx);
      myObservable2.set(1, tx);
    });
  });
  test("bug: fromObservableLight doesnt subscribe", () => {
    const log = new Log();
    const myObservable = new LoggingObservableValue("myObservable", 0, log);
    const myDerived = derived((reader) => {
      const val = myObservable.read(reader);
      log.log(`myDerived.computed(myObservable2: ${val})`);
      return val % 10;
    });
    const e = Event.fromObservableLight(myDerived);
    log.log("event created");
    e(() => {
      log.log("event fired");
    });
    myObservable.set(1, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "event created",
      "myObservable.firstObserverAdded",
      "myObservable.get",
      "myDerived.computed(myObservable2: 0)",
      "myObservable.set (value 1)",
      "myObservable.get",
      "myDerived.computed(myObservable2: 1)",
      "event fired"
    ]);
  });
  test("bug: Event.fromObservable always should get events", () => {
    const emitter = new Emitter();
    const log = new Log();
    let i = 0;
    const obs = observableFromEvent(emitter.event, () => i);
    i++;
    emitter.fire(1);
    const evt2 = Event.fromObservable(obs);
    const d = evt2((e) => {
      log.log(`event fired ${e}`);
    });
    i++;
    emitter.fire(2);
    assert.deepStrictEqual(log.getAndClearEntries(), ["event fired 2"]);
    i++;
    emitter.fire(3);
    assert.deepStrictEqual(log.getAndClearEntries(), ["event fired 3"]);
    d.dispose();
  });
  test("dont run autorun after dispose", () => {
    const log = new Log();
    const myObservable = new LoggingObservableValue("myObservable", 0, log);
    const d = autorun((reader) => {
      const v = myObservable.read(reader);
      log.log("autorun, myObservable:" + v);
    });
    transaction((tx) => {
      myObservable.set(1, tx);
      d.dispose();
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.firstObserverAdded",
      "myObservable.get",
      "autorun, myObservable:0",
      "myObservable.set (value 1)",
      "myObservable.lastObserverRemoved"
    ]);
  });
  suite("waitForState", () => {
    test("resolve", async () => {
      const log = new Log();
      const myObservable = new LoggingObservableValue("myObservable", { state: "initializing" }, log);
      const p = waitForState(myObservable, (p2) => p2.state === "ready", (p2) => p2.state === "error").then((r) => {
        log.log(`resolved ${JSON.stringify(r)}`);
      }, (err) => {
        log.log(`rejected ${JSON.stringify(err)}`);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.firstObserverAdded",
        "myObservable.get"
      ]);
      myObservable.set({ state: "ready" }, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value [object Object])",
        "myObservable.get",
        "myObservable.lastObserverRemoved"
      ]);
      await p;
      assert.deepStrictEqual(log.getAndClearEntries(), [
        'resolved {"state":"ready"}'
      ]);
    });
    test("resolveImmediate", async () => {
      const log = new Log();
      const myObservable = new LoggingObservableValue("myObservable", { state: "ready" }, log);
      const p = waitForState(myObservable, (p2) => p2.state === "ready", (p2) => p2.state === "error").then((r) => {
        log.log(`resolved ${JSON.stringify(r)}`);
      }, (err) => {
        log.log(`rejected ${JSON.stringify(err)}`);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.firstObserverAdded",
        "myObservable.get",
        "myObservable.lastObserverRemoved"
      ]);
      myObservable.set({ state: "error" }, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value [object Object])"
      ]);
      await p;
      assert.deepStrictEqual(log.getAndClearEntries(), [
        'resolved {"state":"ready"}'
      ]);
    });
    test("reject", async () => {
      const log = new Log();
      const myObservable = new LoggingObservableValue("myObservable", { state: "initializing" }, log);
      const p = waitForState(myObservable, (p2) => p2.state === "ready", (p2) => p2.state === "error").then((r) => {
        log.log(`resolved ${JSON.stringify(r)}`);
      }, (err) => {
        log.log(`rejected ${JSON.stringify(err)}`);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.firstObserverAdded",
        "myObservable.get"
      ]);
      myObservable.set({ state: "error" }, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value [object Object])",
        "myObservable.get",
        "myObservable.lastObserverRemoved"
      ]);
      await p;
      assert.deepStrictEqual(log.getAndClearEntries(), [
        'rejected {"state":"error"}'
      ]);
    });
    test("derived as lazy", () => {
      const store = new DisposableStore();
      const log = new Log();
      let i = 0;
      const d = derivedDisposable(() => {
        const id = i++;
        log.log("myDerived " + id);
        return {
          dispose: () => log.log(`disposed ${id}`)
        };
      });
      d.get();
      assert.deepStrictEqual(log.getAndClearEntries(), ["myDerived 0", "disposed 0"]);
      d.get();
      assert.deepStrictEqual(log.getAndClearEntries(), ["myDerived 1", "disposed 1"]);
      d.keepObserved(store);
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      d.get();
      assert.deepStrictEqual(log.getAndClearEntries(), ["myDerived 2"]);
      d.get();
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      store.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), ["disposed 2"]);
    });
  });
  test("observableValue", () => {
    const log = new Log();
    const myObservable1 = observableValue("myObservable1", 0);
    const myObservable2 = observableValue("myObservable2", 0);
    const d = autorun((reader) => {
      const v1 = myObservable1.read(reader);
      const v2 = myObservable2.read(reader);
      log.log("autorun, myObservable1:" + v1 + ", myObservable2:" + v2);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "autorun, myObservable1:0, myObservable2:0"
    ]);
    myObservable1.set(0, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), []);
    myObservable2.set(0, void 0, { message: "change1" });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "autorun, myObservable1:0, myObservable2:0"
    ]);
    d.dispose();
  });
  suite("autorun error handling", () => {
    test("immediate throw", () => {
      const log = new Log();
      setUnexpectedErrorHandler((e) => {
        log.log(`error: ${e.message}`);
      });
      const myObservable = new LoggingObservableValue("myObservable", 0, log);
      const d = autorun((reader) => {
        myObservable.read(reader);
        throw new Error("foobar");
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.firstObserverAdded",
        "myObservable.get",
        "error: foobar"
      ]);
      myObservable.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value 1)",
        "myObservable.get",
        "error: foobar"
      ]);
      d.dispose();
    });
    test("late throw", () => {
      const log = new Log();
      setUnexpectedErrorHandler((e) => {
        log.log(`error: ${e.message}`);
      });
      const myObservable = new LoggingObservableValue("myObservable", 0, log);
      const d = autorun((reader) => {
        const value = myObservable.read(reader);
        if (value >= 1) {
          throw new Error("foobar");
        }
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.firstObserverAdded",
        "myObservable.get"
      ]);
      myObservable.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value 1)",
        "myObservable.get",
        "error: foobar"
      ]);
      myObservable.set(2, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value 2)",
        "myObservable.get",
        "error: foobar"
      ]);
      d.dispose();
    });
  });
  test("recomputeInitiallyAndOnChange should work when a dependency sets an observable", () => {
    const store = new DisposableStore();
    const log = new Log();
    const myObservable = new LoggingObservableValue("myObservable", 0, log);
    let shouldUpdate = true;
    const myDerived = derived((reader) => {
      log.log("myDerived.computed start");
      const val = myObservable.read(reader);
      if (shouldUpdate) {
        shouldUpdate = false;
        myObservable.set(1, void 0);
      }
      log.log("myDerived.computed end");
      return val;
    });
    assert.deepStrictEqual(log.getAndClearEntries(), []);
    myDerived.recomputeInitiallyAndOnChange(store, (val) => {
      log.log(`recomputeInitiallyAndOnChange, myDerived: ${val}`);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myDerived.computed start",
      "myObservable.firstObserverAdded",
      "myObservable.get",
      "myObservable.set (value 1)",
      "myDerived.computed end",
      "myDerived.computed start",
      "myObservable.get",
      "myDerived.computed end",
      "recomputeInitiallyAndOnChange, myDerived: 1"
    ]);
    myDerived.get();
    assert.deepStrictEqual(log.getAndClearEntries(), []);
    store.dispose();
  });
  suite("prevent invalid usage", () => {
    suite("reading outside of compute function", () => {
      test("derived", () => {
        let fn = () => {
        };
        const obs = observableValue("obs", 0);
        const d = derived((reader) => {
          fn = () => {
            obs.read(reader);
          };
          return obs.read(reader);
        });
        const disp = autorun((reader) => {
          d.read(reader);
        });
        assert.throws(() => {
          fn();
        });
        disp.dispose();
      });
      test("autorun", () => {
        let fn = () => {
        };
        const obs = observableValue("obs", 0);
        const disp = autorun((reader) => {
          fn = () => {
            obs.read(reader);
          };
          obs.read(reader);
        });
        assert.throws(() => {
          fn();
        });
        disp.dispose();
      });
    });
    test.skip("catches cyclic dependencies", () => {
      const log = new Log();
      setUnexpectedErrorHandler((e) => {
        log.log(e.toString());
      });
      const obs = observableValue("obs", 0);
      const d1 = derived((reader) => {
        log.log("d1.computed start");
        const x = obs.read(reader) + d2.read(reader);
        log.log("d1.computed end");
        return x;
      });
      const d2 = derived((reader) => {
        log.log("d2.computed start");
        d1.read(reader);
        log.log("d2.computed end");
        return 0;
      });
      const disp = autorun((reader) => {
        log.log("autorun start");
        d1.read(reader);
        log.log("autorun end");
        return 0;
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "autorun start",
        "d1.computed start",
        "d2.computed start",
        "Error: Cyclic deriveds are not supported yet!",
        "d1.computed end",
        "autorun end"
      ]);
      disp.dispose();
    });
  });
  suite("observableReducer", () => {
    test("main", () => {
      const store = new DisposableStore();
      const log = new Log();
      const myObservable1 = observableValue("myObservable1", 5);
      const myObservable2 = observableValue("myObservable2", 9);
      const sum = observableReducer(void 0, {
        initial: () => {
          log.log("createInitial");
          return myObservable1.get() + myObservable2.get();
        },
        disposeFinal: (values) => {
          log.log(`disposeFinal ${values}`);
        },
        changeTracker: recordChanges({ myObservable1, myObservable2 }),
        update: (reader, previousValue, changes) => {
          log.log(`update ${JSON.stringify(changes)}`);
          let delta = 0;
          for (const change of changes.changes) {
            delta += change.change;
          }
          reader.reportChange(delta);
          const resultValue = previousValue + delta;
          log.log(`update -> ${resultValue}`);
          return resultValue;
        }
      });
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      store.add(autorunWithStoreHandleChanges({
        changeTracker: recordChanges({ sum })
      }, (_reader, changes) => {
        log.log(`autorun ${JSON.stringify(changes)}`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "createInitial",
        'update {"changes":[],"myObservable1":5,"myObservable2":9}',
        "update -> 14",
        'autorun {"changes":[],"sum":14}'
      ]);
      transaction((tx) => {
        myObservable1.set(myObservable1.get() + 1, tx, 1);
        myObservable2.set(myObservable2.get() + 3, tx, 3);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        'update {"changes":[{"key":"myObservable1","change":1},{"key":"myObservable2","change":3}],"myObservable1":6,"myObservable2":12}',
        "update -> 18",
        'autorun {"changes":[{"key":"sum","change":4}],"sum":18}'
      ]);
      transaction((tx) => {
        myObservable1.set(myObservable1.get() + 1, tx, 1);
        const s = sum.get();
        log.log(`sum.get() ${s}`);
        myObservable2.set(myObservable2.get() + 3, tx, 3);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        'update {"changes":[{"key":"myObservable1","change":1}],"myObservable1":7,"myObservable2":12}',
        "update -> 19",
        "sum.get() 19",
        'update {"changes":[{"key":"myObservable2","change":3}],"myObservable1":7,"myObservable2":15}',
        "update -> 22",
        'autorun {"changes":[{"key":"sum","change":1}],"sum":22}'
      ]);
      store.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "disposeFinal 22"
      ]);
    });
  });
  suite("disposableStores", () => {
    test("derived with store", () => {
      const log = new Log();
      const observable1 = observableValue("myObservableValue1", 0);
      const computed1 = derived((reader) => {
        const value = observable1.read(reader);
        log.log(`computed ${value}`);
        reader.store.add(toDisposable(() => {
          log.log(`computed1: ${value} disposed`);
        }));
        return value;
      });
      const a = autorun((reader) => {
        log.log(`a: ${computed1.read(reader)}`);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "computed 0",
        "a: 0"
      ]);
      observable1.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "computed1: 0 disposed",
        "computed 1",
        "a: 1"
      ]);
      a.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "computed1: 1 disposed"
      ]);
    });
    test("derived with delayedStore", () => {
      const log = new Log();
      const observable1 = observableValue("myObservableValue1", 0);
      const computed1 = derived((reader) => {
        const value = observable1.read(reader);
        log.log(`computed ${value}`);
        reader.delayedStore.add(toDisposable(() => {
          log.log(`computed1: ${value} disposed`);
        }));
        return value;
      });
      const a = autorun((reader) => {
        log.log(`a: ${computed1.read(reader)}`);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "computed 0",
        "a: 0"
      ]);
      observable1.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "computed 1",
        "computed1: 0 disposed",
        "a: 1"
      ]);
      a.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "computed1: 1 disposed"
      ]);
    });
  });
  test("derivedHandleChanges with reportChanges", () => {
    const log = new Log();
    const signal1 = observableSignal("signal1");
    const signal2 = observableSignal("signal2");
    const signal2Derived = derivedHandleChanges(
      { changeTracker: recordChanges({ signal2 }) },
      (reader, changeSummary) => {
        for (const c of changeSummary.changes) {
          reader.reportChange({ message: c.change.message + " (derived)" });
        }
      }
    );
    const d = derivedHandleChanges({
      changeTracker: recordChanges({ signal1, signal2Derived })
    }, (r, changes) => {
      const log2 = changes.changes.map((c) => `${c.key}: ${c.change.message}`).join(", ");
      r.reportChange(log2);
    });
    const disp = runOnChange(d, (_val, _prev, changes) => {
      log.log(`runOnChange ${JSON.stringify(changes)}`);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), []);
    transaction((tx) => {
      signal1.trigger(tx, { message: "foo" });
      signal2.trigger(tx, { message: "bar" });
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      'runOnChange ["signal1: foo, signal2Derived: bar (derived)"]'
    ]);
    transaction((tx) => {
      signal2.trigger(tx, { message: "baz" });
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      'runOnChange ["signal2Derived: baz (derived)"]'
    ]);
    disp.dispose();
  });
  suite("autorunPerKeyedItem", () => {
    test("runs setup once per key, fires per-key observable on in-place value change, disposes on removal", () => {
      const log = new Log();
      const items = observableValue("items", []);
      const d = ds.add(autorunPerKeyedItem(
        items,
        (it) => it.id,
        (key, value, store) => {
          log.log(`setup(${key})`);
          store.add(toDisposable(() => log.log(`dispose(${key})`)));
          store.add(autorun((reader) => {
            const v = value.read(reader);
            log.log(`autorun(${key}): v=${v.v}`);
          }));
        }
      ));
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      items.set([{ id: "a", v: 1 }, { id: "b", v: 1 }], void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "setup(a)",
        "autorun(a): v=1",
        "setup(b)",
        "autorun(b): v=1"
      ]);
      items.set([{ id: "a", v: 2 }, { id: "b", v: 1 }], void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "autorun(a): v=2",
        "autorun(b): v=1"
      ]);
      items.set([{ id: "b", v: 1 }], void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "dispose(a)",
        "autorun(b): v=1"
      ]);
      items.set([{ id: "b", v: 1 }, { id: "a", v: 9 }], void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "autorun(b): v=1",
        "setup(a)",
        "autorun(a): v=9"
      ]);
      d.dispose();
      assert.deepStrictEqual(log.getAndClearEntries().sort(), [
        "dispose(a)",
        "dispose(b)"
      ]);
    });
    test("batches per-key value updates atomically across one items change", () => {
      const log = new Log();
      const items = observableValue("items", [
        { id: "a", v: 0 },
        { id: "b", v: 0 }
      ]);
      ds.add(autorunPerKeyedItem(
        items,
        (it) => it.id,
        (key, value, store) => {
          store.add(autorun((reader) => {
            log.log(`${key}=${value.read(reader).v}`);
          }));
        }
      ));
      assert.deepStrictEqual(log.getAndClearEntries(), ["a=0", "b=0"]);
      items.set([{ id: "a", v: 1 }, { id: "b", v: 2 }], void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), ["a=1", "b=2"]);
    });
    test("does not fire per-key observable when same item identity is reused", () => {
      const log = new Log();
      const a = { id: "a", v: 1 };
      const items = observableValue("items", [a]);
      ds.add(autorunPerKeyedItem(
        items,
        (it) => it.id,
        (_key, value, store) => {
          store.add(autorun((reader) => log.log(`v=${value.read(reader).v}`)));
        }
      ));
      assert.deepStrictEqual(log.getAndClearEntries(), ["v=1"]);
      items.set([a], void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), []);
    });
    test("per-key setup fires when items derived through observableFromEvent chain updates", () => {
      const log = new Log();
      let current = void 0;
      const onChange = ds.add(new Emitter());
      const fakeSub = { value: void 0, onDidChange: onChange.event };
      const sessionState$ = observableFromEvent(void 0, fakeSub.onDidChange, () => fakeSub.value);
      const fire = (s) => {
        current = s;
        fakeSub.value = s;
        onChange.fire(s);
      };
      const turn$ = derived((reader) => sessionState$.read(reader)?.active);
      const parts$ = derived((reader) => turn$.read(reader)?.parts ?? []);
      ds.add(autorunPerKeyedItem(
        parts$,
        (p) => p.id,
        (key, p$, store) => {
          log.log(`setup(${key})`);
          store.add(autorun((reader) => log.log(`${key}=${p$.read(reader).content.length}`)));
        }
      ));
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      fire({ active: { id: "t1", parts: [{ id: "p1", content: "hello" }] } });
      assert.deepStrictEqual(log.getAndClearEntries(), ["setup(p1)", "p1=5"]);
      fire({ active: { id: "t1", parts: [{ id: "p1", content: "hello world" }] } });
      assert.deepStrictEqual(log.getAndClearEntries(), ["p1=11"]);
      fire({ active: { id: "t1", parts: [{ id: "p1", content: "hello world" }, { id: "p2", content: "reasoning" }] } });
      assert.deepStrictEqual(log.getAndClearEntries(), ["p1=11", "setup(p2)", "p2=9"]);
      void current;
    });
  });
});
class LoggingObserver {
  constructor(debugName, log) {
    this.debugName = debugName;
    this.log = log;
    this.count = 0;
  }
  beginUpdate(observable) {
    this.count++;
    this.log.log(`${this.debugName}.beginUpdate (count ${this.count})`);
  }
  endUpdate(observable) {
    this.log.log(`${this.debugName}.endUpdate (count ${this.count})`);
    this.count--;
  }
  handleChange(observable, change) {
    this.log.log(`${this.debugName}.handleChange (count ${this.count})`);
  }
  handlePossibleChange(observable) {
    this.log.log(`${this.debugName}.handlePossibleChange`);
  }
}
class LoggingObservableValue extends BaseObservable {
  constructor(debugName, initialValue, logger) {
    super(DebugLocation.ofCaller());
    this.debugName = debugName;
    this.logger = logger;
    this.value = initialValue;
  }
  onFirstObserverAdded() {
    this.logger.log(`${this.debugName}.firstObserverAdded`);
  }
  onLastObserverRemoved() {
    this.logger.log(`${this.debugName}.lastObserverRemoved`);
  }
  get() {
    this.logger.log(`${this.debugName}.get`);
    return this.value;
  }
  set(value, tx, change) {
    if (this.value === value) {
      return;
    }
    if (!tx) {
      transaction((tx2) => {
        this.set(value, tx2, change);
      }, () => `Setting ${this.debugName}`);
      return;
    }
    this.logger.log(`${this.debugName}.set (value ${value})`);
    this.value = value;
    for (const observer of this._observers) {
      tx.updateObserver(observer, this);
      observer.handleChange(this, change);
    }
  }
  toString() {
    return `${this.debugName}: ${this.value}`;
  }
}
class Log {
  constructor() {
    this.entries = [];
  }
  log(message) {
    this.entries.push(message);
  }
  getAndClearEntries() {
    const entries = [...this.entries];
    this.entries.length = 0;
    return entries;
  }
}
export {
  LoggingObservableValue,
  LoggingObserver
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXG9ic2VydmFibGVzXFxvYnNlcnZhYmxlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSURlcml2ZWRSZWFkZXIsIElPYnNlcnZhYmxlV2l0aENoYW5nZSwgYXV0b3J1biwgYXV0b3J1bkhhbmRsZUNoYW5nZXMsIGF1dG9ydW5QZXJLZXllZEl0ZW0sIGF1dG9ydW5XaXRoU3RvcmVIYW5kbGVDaGFuZ2VzLCBkZXJpdmVkLCBkZXJpdmVkRGlzcG9zYWJsZSwgSU9ic2VydmFibGUsIElPYnNlcnZlciwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBrZWVwT2JzZXJ2ZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVTaWduYWwsIG9ic2VydmFibGVWYWx1ZSwgcmVjb3JkQ2hhbmdlcywgdHJhbnNhY3Rpb24sIHdhaXRGb3JTdGF0ZSwgZGVyaXZlZEhhbmRsZUNoYW5nZXMsIHJ1bk9uQ2hhbmdlLCBEZWJ1Z0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vdXRpbHMuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGVlcC1pbXBvcnQtb2YtaW50ZXJuYWxcbmltcG9ydCB7IG9ic2VydmFibGVSZWR1Y2VyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9leHBlcmltZW50YWwvcmVkdWNlci5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kZWVwLWltcG9ydC1vZi1pbnRlcm5hbFxuaW1wb3J0IHsgQmFzZU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vb2JzZXJ2YWJsZUludGVybmFsL29ic2VydmFibGVzL2Jhc2VPYnNlcnZhYmxlLmpzJztcblxuc3VpdGUoJ29ic2VydmFibGVzJywgKCkgPT4ge1xuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8qKlxuXHQgKiBSZWFkcyB0aGVzZSB0ZXN0cyB0byB1bmRlcnN0YW5kIGhvdyB0byB1c2Ugb2JzZXJ2YWJsZXMuXG5cdCAqL1xuXHRzdWl0ZSgndHV0b3JpYWwnLCAoKSA9PiB7XG5cdFx0dGVzdCgnb2JzZXJ2YWJsZSArIGF1dG9ydW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0XHQvLyBUaGlzIGNyZWF0ZXMgYSB2YXJpYWJsZSB0aGF0IHN0b3JlcyBhIHZhbHVlIGFuZCB3aG9zZSB2YWx1ZSBjaGFuZ2VzIGNhbiBiZSBvYnNlcnZlZC5cblx0XHRcdC8vIFRoZSBuYW1lIGlzIG9ubHkgdXNlZCBmb3IgZGVidWdnaW5nIHB1cnBvc2VzLlxuXHRcdFx0Ly8gVGhlIHNlY29uZCBhcmcgaXMgdGhlIGluaXRpYWwgdmFsdWUuXG5cdFx0XHRjb25zdCBteU9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZScsIDApO1xuXG5cdFx0XHQvLyBUaGlzIGNyZWF0ZXMgYW4gYXV0b3J1bjogSXQgcnVucyBpbW1lZGlhdGVseSBhbmQgdGhlbiBhZ2FpbiB3aGVuZXZlciBhbnkgb2YgdGhlXG5cdFx0XHQvLyBkZXBlbmRlbmNpZXMgY2hhbmdlLiBEZXBlbmRlbmNpZXMgYXJlIHRyYWNrZWQgYnkgcmVhZGluZyBvYnNlcnZhYmxlcyB3aXRoIHRoZSBgcmVhZGVyYCBwYXJhbWV0ZXIuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gVGhlIEBkZXNjcmlwdGlvbiBpcyBvbmx5IHVzZWQgZm9yIGRlYnVnZ2luZyBwdXJwb3Nlcy5cblx0XHRcdC8vIFRoZSBhdXRvcnVuIGhhcyB0byBiZSBkaXNwb3NlZCEgVGhpcyBpcyB2ZXJ5IGltcG9ydGFudC5cblx0XHRcdGRzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuICovXG5cblx0XHRcdFx0Ly8gVGhpcyBjb2RlIGlzIHJ1biBpbW1lZGlhdGVseS5cblxuXHRcdFx0XHQvLyBVc2UgdGhlIGByZWFkZXJgIHRvIHJlYWQgb2JzZXJ2YWJsZSB2YWx1ZXMgYW5kIHRyYWNrIHRoZSBkZXBlbmRlbmN5IHRvIHRoZW0uXG5cdFx0XHRcdC8vIElmIHlvdSB1c2UgYG9ic2VydmFibGUuZ2V0KClgIGluc3RlYWQgb2YgYG9ic2VydmFibGUucmVhZChyZWFkZXIpYCwgeW91IHdpbGwganVzdFxuXHRcdFx0XHQvLyBnZXQgdGhlIHZhbHVlIGFuZCBub3Qgc3Vic2NyaWJlIHRvIGl0LlxuXHRcdFx0XHRsb2cubG9nKGBteUF1dG9ydW4ucnVuKG15T2JzZXJ2YWJsZTogJHtteU9ic2VydmFibGUucmVhZChyZWFkZXIpfSlgKTtcblxuXHRcdFx0XHQvLyBOb3cgdGhhdCBhbGwgZGVwZW5kZW5jaWVzIGFyZSB0cmFja2VkLCB0aGUgYXV0b3J1biBpcyByZS1ydW4gd2hlbmV2ZXIgYW55IG9mIHRoZVxuXHRcdFx0XHQvLyBkZXBlbmRlbmNpZXMgY2hhbmdlLlxuXHRcdFx0fSkpO1xuXHRcdFx0Ly8gVGhlIGF1dG9ydW4gcnVucyBpbW1lZGlhdGVseVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnbXlBdXRvcnVuLnJ1bihteU9ic2VydmFibGU6IDApJ10pO1xuXG5cdFx0XHQvLyBXZSBzZXQgdGhlIG9ic2VydmFibGUuXG5cdFx0XHRteU9ic2VydmFibGUuc2V0KDEsIHVuZGVmaW5lZCk7XG5cdFx0XHQvLyAtPiBUaGUgYXV0b3J1biBydW5zIGFnYWluIHdoZW4gYW55IHJlYWQgb2JzZXJ2YWJsZSBjaGFuZ2VkXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgWydteUF1dG9ydW4ucnVuKG15T2JzZXJ2YWJsZTogMSknXSk7XG5cblx0XHRcdC8vIFdlIHNldCB0aGUgb2JzZXJ2YWJsZSBhZ2Fpbi5cblx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoMSwgdW5kZWZpbmVkKTtcblx0XHRcdC8vIC0+IFRoZSBhdXRvcnVuIGRvZXMgbm90IHJ1biBhZ2FpbiwgYmVjYXVzZSB0aGUgb2JzZXJ2YWJsZSBkaWRuJ3QgY2hhbmdlLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblxuXHRcdFx0Ly8gVHJhbnNhY3Rpb25zIGJhdGNoIGF1dG9ydW4gcnVuc1xuXHRcdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoMiwgdHgpO1xuXHRcdFx0XHQvLyBObyBhdXRvLXJ1biByYW4geWV0LCBldmVuIHRob3VnaCB0aGUgdmFsdWUgY2hhbmdlZCFcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblxuXHRcdFx0XHRteU9ic2VydmFibGUuc2V0KDMsIHR4KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblx0XHRcdH0pO1xuXHRcdFx0Ly8gT25seSBhdCB0aGUgZW5kIG9mIHRoZSB0cmFuc2FjdGlvbiB0aGUgYXV0b3J1biByZS1ydW5zXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgWydteUF1dG9ydW4ucnVuKG15T2JzZXJ2YWJsZTogMyknXSk7XG5cblx0XHRcdC8vIE5vdGUgdGhhdCB0aGUgYXV0b3J1biBkaWQgbm90IHNlZSB0aGUgaW50ZXJtZWRpYXRlIHZhbHVlIGAyYCFcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rlcml2ZWQgKyBhdXRvcnVuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2YWJsZTEgPSBvYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZTEnLCAwKTtcblx0XHRcdGNvbnN0IG9ic2VydmFibGUyID0gb2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUyJywgMCk7XG5cblx0XHRcdC8vIEEgZGVyaXZlZCB2YWx1ZSBpcyBhbiBvYnNlcnZhYmxlIHRoYXQgaXMgZGVyaXZlZCBmcm9tIG90aGVyIG9ic2VydmFibGVzLlxuXHRcdFx0Y29uc3QgbXlEZXJpdmVkID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15RGVyaXZlZCAqL1xuXHRcdFx0XHRjb25zdCB2YWx1ZTEgPSBvYnNlcnZhYmxlMS5yZWFkKHJlYWRlcik7IC8vIFVzZSB0aGUgcmVhZGVyIHRvIHRyYWNrIGRlcGVuZGVuY2llcy5cblx0XHRcdFx0Y29uc3QgdmFsdWUyID0gb2JzZXJ2YWJsZTIucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBzdW0gPSB2YWx1ZTEgKyB2YWx1ZTI7XG5cdFx0XHRcdGxvZy5sb2coYG15RGVyaXZlZC5yZWNvbXB1dGU6ICR7dmFsdWUxfSArICR7dmFsdWUyfSA9ICR7c3VtfWApO1xuXHRcdFx0XHRyZXR1cm4gc3VtO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFdlIGNyZWF0ZSBhbiBhdXRvcnVuIHRoYXQgcmVhY3RzIG9uIGNoYW5nZXMgdG8gb3VyIGRlcml2ZWQgdmFsdWUuXG5cdFx0XHRkcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15QXV0b3J1biAqL1xuXHRcdFx0XHQvLyBBdXRvcnVucyB3b3JrIHdpdGggb2JzZXJ2YWJsZSB2YWx1ZXMgYW5kIGRlcml2ZWRzIC0gaW4gc2hvcnQsIHRoZXkgd29yayB3aXRoIGFueSBvYnNlcnZhYmxlLlxuXHRcdFx0XHRsb2cubG9nKGBteUF1dG9ydW4obXlEZXJpdmVkOiAke215RGVyaXZlZC5yZWFkKHJlYWRlcil9KWApO1xuXHRcdFx0fSkpO1xuXHRcdFx0Ly8gYXV0b3J1biBydW5zIGltbWVkaWF0ZWx5XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlEZXJpdmVkLnJlY29tcHV0ZTogMCArIDAgPSAwJyxcblx0XHRcdFx0J215QXV0b3J1bihteURlcml2ZWQ6IDApJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRvYnNlcnZhYmxlMS5zZXQoMSwgdW5kZWZpbmVkKTtcblx0XHRcdC8vIGFuZCBvbiBjaGFuZ2VzLi4uXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlEZXJpdmVkLnJlY29tcHV0ZTogMSArIDAgPSAxJyxcblx0XHRcdFx0J215QXV0b3J1bihteURlcml2ZWQ6IDEpJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRvYnNlcnZhYmxlMi5zZXQoMSwgdW5kZWZpbmVkKTtcblx0XHRcdC8vIC4uLiBvZiBhbnkgZGVwZW5kZW5jeS5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteURlcml2ZWQucmVjb21wdXRlOiAxICsgMSA9IDInLFxuXHRcdFx0XHQnbXlBdXRvcnVuKG15RGVyaXZlZDogMiknLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIE5vdyB3ZSBjaGFuZ2UgbXVsdGlwbGUgb2JzZXJ2YWJsZXMgaW4gYSB0cmFuc2FjdGlvbiB0byBiYXRjaCBwcm9jZXNzIHRoZSBlZmZlY3RzLlxuXHRcdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRcdG9ic2VydmFibGUxLnNldCg1LCB0eCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cblx0XHRcdFx0b2JzZXJ2YWJsZTIuc2V0KDUsIHR4KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblx0XHRcdH0pO1xuXHRcdFx0Ly8gV2hlbiBjaGFuZ2luZyBtdWx0aXBsZSBvYnNlcnZhYmxlcyBpbiBhIHRyYW5zYWN0aW9uLFxuXHRcdFx0Ly8gZGVyaXZlZHMgYXJlIG9ubHkgcmVjb21wdXRlZCBvbiBkZW1hbmQuXG5cdFx0XHQvLyAoTm90ZSB0aGF0IHlvdSBjYW5ub3Qgc2VlIHRoZSBpbnRlcm1lZGlhdGUgdmFsdWUgd2hlbiBgb2JzMSA9PSA1YCBhbmQgYG9iczIgPT0gMWApXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlEZXJpdmVkLnJlY29tcHV0ZTogNSArIDUgPSAxMCcsXG5cdFx0XHRcdCdteUF1dG9ydW4obXlEZXJpdmVkOiAxMCknLFxuXHRcdFx0XSk7XG5cblx0XHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0XHRvYnNlcnZhYmxlMS5zZXQoNiwgdHgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXG5cdFx0XHRcdG9ic2VydmFibGUyLnNldCg0LCB0eCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cdFx0XHR9KTtcblx0XHRcdC8vIE5vdyB0aGUgYXV0b3J1biBkaWRuJ3QgcnVuIGFnYWluLCBiZWNhdXNlIGl0cyBkZXBlbmRlbmN5IGNoYW5nZWQgZnJvbSAxMCB0byAxMCAoPSBubyBjaGFuZ2UpLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbJ215RGVyaXZlZC5yZWNvbXB1dGU6IDYgKyA0ID0gMTAnXSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZCBkdXJpbmcgdHJhbnNhY3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0XHRjb25zdCBvYnNlcnZhYmxlMSA9IG9ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlMScsIDApO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2YWJsZTIgPSBvYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZTInLCAwKTtcblxuXHRcdFx0Y29uc3QgbXlEZXJpdmVkID0gZGVyaXZlZCgocmVhZGVyKSA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlEZXJpdmVkICovXG5cdFx0XHRcdGNvbnN0IHZhbHVlMSA9IG9ic2VydmFibGUxLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgdmFsdWUyID0gb2JzZXJ2YWJsZTIucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBzdW0gPSB2YWx1ZTEgKyB2YWx1ZTI7XG5cdFx0XHRcdGxvZy5sb2coYG15RGVyaXZlZC5yZWNvbXB1dGU6ICR7dmFsdWUxfSArICR7dmFsdWUyfSA9ICR7c3VtfWApO1xuXHRcdFx0XHRyZXR1cm4gc3VtO1xuXHRcdFx0fSk7XG5cblx0XHRcdGRzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuICovXG5cdFx0XHRcdGxvZy5sb2coYG15QXV0b3J1bihteURlcml2ZWQ6ICR7bXlEZXJpdmVkLnJlYWQocmVhZGVyKX0pYCk7XG5cdFx0XHR9KSk7XG5cdFx0XHQvLyBhdXRvcnVuIHJ1bnMgaW1tZWRpYXRlbHlcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteURlcml2ZWQucmVjb21wdXRlOiAwICsgMCA9IDAnLFxuXHRcdFx0XHQnbXlBdXRvcnVuKG15RGVyaXZlZDogMCknLFxuXHRcdFx0XSk7XG5cblx0XHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0XHRvYnNlcnZhYmxlMS5zZXQoLTEwLCB0eCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cblx0XHRcdFx0bXlEZXJpdmVkLmdldCgpOyAvLyBUaGlzIGZvcmNlcyBhIChzeW5jKSByZWNvbXB1dGF0aW9uIG9mIHRoZSBjdXJyZW50IHZhbHVlIVxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFsnbXlEZXJpdmVkLnJlY29tcHV0ZTogLTEwICsgMCA9IC0xMCddKSk7XG5cdFx0XHRcdC8vIFRoaXMgbWVhbnMsIHRoYXQgZXZlbiBpbiB0cmFuc2FjdGlvbnMgeW91IGNhbiBhc3N1bWUgdGhhdCBhbGwgdmFsdWVzIHlvdSBjYW4gcmVhZCB3aXRoIGBnZXRgIGFuZCBgcmVhZGAgYXJlIHVwLXRvLWRhdGUuXG5cdFx0XHRcdC8vIFJlYWQgdGhlc2UgdmFsdWVzIGp1c3QgbWlnaHQgY2F1c2UgYWRkaXRpb25hbCAocG90ZW50aWFsbHkgdW5uZWVkZWQpIHJlY29tcHV0YXRpb25zLlxuXG5cdFx0XHRcdG9ic2VydmFibGUyLnNldCgxMCwgdHgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXHRcdFx0fSk7XG5cdFx0XHQvLyBUaGlzIGF1dG9ydW4gcnVucyBhZ2FpbiwgYmVjYXVzZSBpdHMgZGVwZW5kZW5jeSBjaGFuZ2VkIGZyb20gMCB0byAtMTAgYW5kIHRoZW4gYmFjayB0byAwLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215RGVyaXZlZC5yZWNvbXB1dGU6IC0xMCArIDEwID0gMCcsXG5cdFx0XHRcdCdteUF1dG9ydW4obXlEZXJpdmVkOiAwKScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldCB3aXRob3V0IG9ic2VydmVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRcdGNvbnN0IG9ic2VydmFibGUxID0gb2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGVWYWx1ZTEnLCAwKTtcblxuXHRcdFx0Ly8gV2Ugc2V0IHVwIHNvbWUgY29tcHV0ZWRzLlxuXHRcdFx0Y29uc3QgY29tcHV0ZWQxID0gZGVyaXZlZCgocmVhZGVyKSA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gY29tcHV0ZWQgKi9cblx0XHRcdFx0Y29uc3QgdmFsdWUxID0gb2JzZXJ2YWJsZTEucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSB2YWx1ZTEgJSAzO1xuXHRcdFx0XHRsb2cubG9nKGByZWNvbXB1dGUxOiAke3ZhbHVlMX0gJSAzID0gJHtyZXN1bHR9YCk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbXB1dGVkMiA9IGRlcml2ZWQoKHJlYWRlcikgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIGNvbXB1dGVkICovXG5cdFx0XHRcdGNvbnN0IHZhbHVlMSA9IGNvbXB1dGVkMS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHZhbHVlMSAqIDI7XG5cdFx0XHRcdGxvZy5sb2coYHJlY29tcHV0ZTI6ICR7dmFsdWUxfSAqIDIgPSAke3Jlc3VsdH1gKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29tcHV0ZWQzID0gZGVyaXZlZCgocmVhZGVyKSA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gY29tcHV0ZWQgKi9cblx0XHRcdFx0Y29uc3QgdmFsdWUxID0gY29tcHV0ZWQxLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdmFsdWUxICogMztcblx0XHRcdFx0bG9nLmxvZyhgcmVjb21wdXRlMzogJHt2YWx1ZTF9ICogMyA9ICR7cmVzdWx0fWApO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb21wdXRlZFN1bSA9IGRlcml2ZWQoKHJlYWRlcikgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIGNvbXB1dGVkICovXG5cdFx0XHRcdGNvbnN0IHZhbHVlMSA9IGNvbXB1dGVkMi5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHZhbHVlMiA9IGNvbXB1dGVkMy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHZhbHVlMSArIHZhbHVlMjtcblx0XHRcdFx0bG9nLmxvZyhgcmVjb21wdXRlNDogJHt2YWx1ZTF9ICsgJHt2YWx1ZTJ9ID0gJHtyZXN1bHR9YCk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cblx0XHRcdG9ic2VydmFibGUxLnNldCgxLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblxuXHRcdFx0Ly8gQW5kIG5vdyByZWFkIHRoZSBjb21wdXRlZCB0aGF0IGRlcGVuZGVucyBvbiBhbGwgdGhlIG90aGVycy5cblx0XHRcdGxvZy5sb2coYHZhbHVlOiAke2NvbXB1dGVkU3VtLmdldCgpfWApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J3JlY29tcHV0ZTE6IDEgJSAzID0gMScsXG5cdFx0XHRcdCdyZWNvbXB1dGUyOiAxICogMiA9IDInLFxuXHRcdFx0XHQncmVjb21wdXRlMzogMSAqIDMgPSAzJyxcblx0XHRcdFx0J3JlY29tcHV0ZTQ6IDIgKyAzID0gNScsXG5cdFx0XHRcdCd2YWx1ZTogNScsXG5cdFx0XHRdKTtcblxuXHRcdFx0bG9nLmxvZyhgdmFsdWU6ICR7Y29tcHV0ZWRTdW0uZ2V0KCl9YCk7XG5cdFx0XHQvLyBCZWNhdXNlIHRoZXJlIGFyZSBubyBvYnNlcnZlcnMsIHRoZSBkZXJpdmVkIHZhbHVlcyBhcmUgbm90IGNhY2hlZCAoISksIGJ1dCBjb21wdXRlZCBmcm9tIHNjcmF0Y2guXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQncmVjb21wdXRlMTogMSAlIDMgPSAxJyxcblx0XHRcdFx0J3JlY29tcHV0ZTI6IDEgKiAyID0gMicsXG5cdFx0XHRcdCdyZWNvbXB1dGUzOiAxICogMyA9IDMnLFxuXHRcdFx0XHQncmVjb21wdXRlNDogMiArIDMgPSA1Jyxcblx0XHRcdFx0J3ZhbHVlOiA1Jyxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0ga2VlcE9ic2VydmVkKGNvbXB1dGVkU3VtKTsgLy8gVXNlIGtlZXBPYnNlcnZlZCB0byBrZWVwIHRoZSBjYWNoZS5cblx0XHRcdC8vIFlvdSBjYW4gYWxzbyB1c2UgYGNvbXB1dGVkU3VtLmtlZXBPYnNlcnZlZChzdG9yZSlgIGZvciBhbiBpbmxpbmUgZXhwZXJpZW5jZS5cblx0XHRcdGxvZy5sb2coYHZhbHVlOiAke2NvbXB1dGVkU3VtLmdldCgpfWApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J3JlY29tcHV0ZTE6IDEgJSAzID0gMScsXG5cdFx0XHRcdCdyZWNvbXB1dGUyOiAxICogMiA9IDInLFxuXHRcdFx0XHQncmVjb21wdXRlMzogMSAqIDMgPSAzJyxcblx0XHRcdFx0J3JlY29tcHV0ZTQ6IDIgKyAzID0gNScsXG5cdFx0XHRcdCd2YWx1ZTogNScsXG5cdFx0XHRdKTtcblxuXHRcdFx0bG9nLmxvZyhgdmFsdWU6ICR7Y29tcHV0ZWRTdW0uZ2V0KCl9YCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQndmFsdWU6IDUnLFxuXHRcdFx0XSk7XG5cdFx0XHQvLyBUYWRhLCBubyByZWNvbXB1dGF0aW9ucyFcblxuXHRcdFx0b2JzZXJ2YWJsZTEuc2V0KDIsIHVuZGVmaW5lZCk7XG5cdFx0XHQvLyBUaGUga2VlcE9ic2VydmVkIGRvZXMgbm90IGZvcmNlIGRlcml2ZWRzIHRvIGJlIHJlY29tcHV0ZWQhIFRoZXkgYXJlIHN0aWxsIGxhenkuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtdKSk7XG5cblx0XHRcdGxvZy5sb2coYHZhbHVlOiAke2NvbXB1dGVkU3VtLmdldCgpfWApO1xuXHRcdFx0Ly8gVGhvc2UgZGVyaXZlZHMgYXJlIHJlY29tcHV0ZWQgb24gZGVtYW5kLCBpLmUuIHdoZW4gc29tZW9uZSByZWFkcyB0aGVtLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J3JlY29tcHV0ZTE6IDIgJSAzID0gMicsXG5cdFx0XHRcdCdyZWNvbXB1dGUyOiAyICogMiA9IDQnLFxuXHRcdFx0XHQncmVjb21wdXRlMzogMiAqIDMgPSA2Jyxcblx0XHRcdFx0J3JlY29tcHV0ZTQ6IDQgKyA2ID0gMTAnLFxuXHRcdFx0XHQndmFsdWU6IDEwJyxcblx0XHRcdF0pO1xuXHRcdFx0bG9nLmxvZyhgdmFsdWU6ICR7Y29tcHV0ZWRTdW0uZ2V0KCl9YCk7XG5cdFx0XHQvLyAuLi4gYW5kIHRoZW4gY2FjaGVkIGFnYWluXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFsndmFsdWU6IDEwJ10pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7IC8vIERvbid0IGZvcmdldCB0byBkaXNwb3NlIHRoZSBrZWVwQWxpdmUgdG8gcHJldmVudCBtZW1vcnkgbGVha3MhXG5cblx0XHRcdGxvZy5sb2coYHZhbHVlOiAke2NvbXB1dGVkU3VtLmdldCgpfWApO1xuXHRcdFx0Ly8gV2hpY2ggZGlzYWJsZXMgdGhlIGNhY2hlIGFnYWluXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQncmVjb21wdXRlMTogMiAlIDMgPSAyJyxcblx0XHRcdFx0J3JlY29tcHV0ZTI6IDIgKiAyID0gNCcsXG5cdFx0XHRcdCdyZWNvbXB1dGUzOiAyICogMyA9IDYnLFxuXHRcdFx0XHQncmVjb21wdXRlNDogNCArIDYgPSAxMCcsXG5cdFx0XHRcdCd2YWx1ZTogMTAnLFxuXHRcdFx0XSk7XG5cblx0XHRcdGxvZy5sb2coYHZhbHVlOiAke2NvbXB1dGVkU3VtLmdldCgpfWApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J3JlY29tcHV0ZTE6IDIgJSAzID0gMicsXG5cdFx0XHRcdCdyZWNvbXB1dGUyOiAyICogMiA9IDQnLFxuXHRcdFx0XHQncmVjb21wdXRlMzogMiAqIDMgPSA2Jyxcblx0XHRcdFx0J3JlY29tcHV0ZTQ6IDQgKyA2ID0gMTAnLFxuXHRcdFx0XHQndmFsdWU6IDEwJyxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBXaHkgZG9uJ3Qgd2UganVzdCBhbHdheXMga2VlcCB0aGUgY2FjaGUgYWxpdmU/XG5cdFx0XHQvLyBUaGlzIGlzIGJlY2F1c2UgaW4gb3JkZXIgdG8ga2VlcCB0aGUgY2FjaGUgYWxpdmUsIHdlIGhhdmUgdG8ga2VlcCBvdXIgc3Vic2NyaXB0aW9ucyB0byBvdXIgZGVwZW5kZW5jaWVzIGFsaXZlLFxuXHRcdFx0Ly8gd2hpY2ggY291bGQgY2F1c2UgbWVtb3J5LWxlYWtzLlxuXHRcdFx0Ly8gU28gaW5zdGVhZCwgd2hlbiB0aGUgbGFzdCBvYnNlcnZlciBvZiBhIGRlcml2ZWQgaXMgZGlzcG9zZWQsIHdlIGRpc3Bvc2Ugb3VyIHN1YnNjcmlwdGlvbnMgdG8gb3VyIGRlcGVuZGVuY2llcy5cblx0XHRcdC8vIGBrZWVwT2JzZXJ2ZWRgIGp1c3QgcHJldmVudHMgdGhpcyBmcm9tIGhhcHBlbmluZy5cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F1dG9ydW4gdGhhdCByZWNlaXZlcyBkZWx0YXMgb2Ygc2lnbmFscycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblxuXHRcdFx0Ly8gQSBzaWduYWwgaXMgYW4gb2JzZXJ2YWJsZSB3aXRob3V0IGEgdmFsdWUuXG5cdFx0XHQvLyBIb3dldmVyLCBpdCBjYW4gc2hpcCBjaGFuZ2UgaW5mb3JtYXRpb24gd2hlbiBpdCBpcyB0cmlnZ2VyZWQuXG5cdFx0XHQvLyBSZWFkZXJzIGNhbiBwcm9jZXNzL2FnZ3JlZ2F0ZSB0aGlzIGNoYW5nZSBpbmZvcm1hdGlvbi5cblx0XHRcdGNvbnN0IHNpZ25hbCA9IG9ic2VydmFibGVTaWduYWw8eyBtc2c6IHN0cmluZyB9Pignc2lnbmFsJyk7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBhdXRvcnVuSGFuZGxlQ2hhbmdlcyh7XG5cdFx0XHRcdGNoYW5nZVRyYWNrZXI6IHtcblx0XHRcdFx0XHQvLyBUaGUgY2hhbmdlIHN1bW1hcnkgaXMgdXNlZCB0byBjb2xsZWN0IHRoZSBjaGFuZ2VzXG5cdFx0XHRcdFx0Y3JlYXRlQ2hhbmdlU3VtbWFyeTogKCkgPT4gKHsgbXNnczogW10gYXMgc3RyaW5nW10gfSksXG5cdFx0XHRcdFx0aGFuZGxlQ2hhbmdlKGNvbnRleHQsIGNoYW5nZVN1bW1hcnkpIHtcblx0XHRcdFx0XHRcdGlmIChjb250ZXh0LmRpZENoYW5nZShzaWduYWwpKSB7XG5cdFx0XHRcdFx0XHRcdC8vIFdlIGp1c3QgcHVzaCB0aGUgY2hhbmdlcyBpbnRvIGFuIGFycmF5XG5cdFx0XHRcdFx0XHRcdGNoYW5nZVN1bW1hcnkubXNncy5wdXNoKGNvbnRleHQuY2hhbmdlLm1zZyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gV2Ugd2FudCB0byBoYW5kbGUgdGhlIGNoYW5nZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1cblx0XHRcdH0sIChyZWFkZXIsIGNoYW5nZVN1bW1hcnkpID0+IHtcblx0XHRcdFx0Ly8gV2hlbiBoYW5kbGluZyB0aGUgY2hhbmdlLCBtYWtlIHN1cmUgdG8gcmVhZCB0aGUgc2lnbmFsIVxuXHRcdFx0XHRzaWduYWwucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRsb2cubG9nKCdtc2dzOiAnICsgY2hhbmdlU3VtbWFyeS5tc2dzLmpvaW4oJywgJykpO1xuXHRcdFx0fSk7XG5cblxuXHRcdFx0c2lnbmFsLnRyaWdnZXIodW5kZWZpbmVkLCB7IG1zZzogJ2Zvb2JhcicgfSk7XG5cblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0Ly8gWW91IGNhbiBiYXRjaCB0cmlnZ2VyaW5nIHNpZ25hbHMuXG5cdFx0XHRcdC8vIE5vIGRlbHRhIGluZm9ybWF0aW9uIGlzIGxvc3QhXG5cdFx0XHRcdHNpZ25hbC50cmlnZ2VyKHR4LCB7IG1zZzogJ2hlbGxvJyB9KTtcblx0XHRcdFx0c2lnbmFsLnRyaWdnZXIodHgsIHsgbXNnOiAnd29ybGQnIH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdtc2dzOiAnLFxuXHRcdFx0XHQnbXNnczogZm9vYmFyJyxcblx0XHRcdFx0J21zZ3M6IGhlbGxvLCB3b3JsZCdcblx0XHRcdF0pO1xuXG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdC8vIFRoYXQgaXMgdGhlIGVuZCBvZiB0aGUgdHV0b3JpYWwuXG5cdFx0Ly8gVGhlcmUgYXJlIGxvdHMgb2YgdXRpbGl0aWVzIHlvdSBjYW4gZXhwbG9yZSBub3csIGxpa2UgYG9ic2VydmFibGVGcm9tRXZlbnRgLCBgRXZlbnQuZnJvbU9ic2VydmFibGVMaWdodGAsXG5cdFx0Ly8gYXV0b3J1bldpdGhTdG9yZSwgb2JzZXJ2YWJsZVdpdGhTdG9yZSBhbmQgc28gb24uXG5cdH0pO1xuXG5cdHRlc3QoJ3RvcG9sb2dpY2FsIG9yZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRjb25zdCBteU9ic2VydmFibGUxID0gb2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUxJywgMCk7XG5cdFx0Y29uc3QgbXlPYnNlcnZhYmxlMiA9IG9ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlMicsIDApO1xuXG5cdFx0Y29uc3QgbXlDb21wdXRlZDEgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15Q29tcHV0ZWQxICovXG5cdFx0XHRjb25zdCB2YWx1ZTEgPSBteU9ic2VydmFibGUxLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZhbHVlMiA9IG15T2JzZXJ2YWJsZTIucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc3VtID0gdmFsdWUxICsgdmFsdWUyO1xuXHRcdFx0bG9nLmxvZyhgbXlDb21wdXRlZDEucmVjb21wdXRlKG15T2JzZXJ2YWJsZTE6ICR7dmFsdWUxfSArIG15T2JzZXJ2YWJsZTI6ICR7dmFsdWUyfSA9ICR7c3VtfSlgKTtcblx0XHRcdHJldHVybiBzdW07XG5cdFx0fSk7XG5cblx0XHRjb25zdCBteUNvbXB1dGVkMiA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlDb21wdXRlZDIgKi9cblx0XHRcdGNvbnN0IHZhbHVlMSA9IG15Q29tcHV0ZWQxLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZhbHVlMiA9IG15T2JzZXJ2YWJsZTEucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgdmFsdWUzID0gbXlPYnNlcnZhYmxlMi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzdW0gPSB2YWx1ZTEgKyB2YWx1ZTIgKyB2YWx1ZTM7XG5cdFx0XHRsb2cubG9nKGBteUNvbXB1dGVkMi5yZWNvbXB1dGUobXlDb21wdXRlZDE6ICR7dmFsdWUxfSArIG15T2JzZXJ2YWJsZTE6ICR7dmFsdWUyfSArIG15T2JzZXJ2YWJsZTI6ICR7dmFsdWUzfSA9ICR7c3VtfSlgKTtcblx0XHRcdHJldHVybiBzdW07XG5cdFx0fSk7XG5cblx0XHRjb25zdCBteUNvbXB1dGVkMyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlDb21wdXRlZDMgKi9cblx0XHRcdGNvbnN0IHZhbHVlMSA9IG15Q29tcHV0ZWQyLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZhbHVlMiA9IG15T2JzZXJ2YWJsZTEucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgdmFsdWUzID0gbXlPYnNlcnZhYmxlMi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzdW0gPSB2YWx1ZTEgKyB2YWx1ZTIgKyB2YWx1ZTM7XG5cdFx0XHRsb2cubG9nKGBteUNvbXB1dGVkMy5yZWNvbXB1dGUobXlDb21wdXRlZDI6ICR7dmFsdWUxfSArIG15T2JzZXJ2YWJsZTE6ICR7dmFsdWUyfSArIG15T2JzZXJ2YWJsZTI6ICR7dmFsdWUzfSA9ICR7c3VtfSlgKTtcblx0XHRcdHJldHVybiBzdW07XG5cdFx0fSk7XG5cblx0XHRkcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteUF1dG9ydW4gKi9cblx0XHRcdGxvZy5sb2coYG15QXV0b3J1bi5ydW4obXlDb21wdXRlZDM6ICR7bXlDb21wdXRlZDMucmVhZChyZWFkZXIpfSlgKTtcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteUNvbXB1dGVkMS5yZWNvbXB1dGUobXlPYnNlcnZhYmxlMTogMCArIG15T2JzZXJ2YWJsZTI6IDAgPSAwKScsXG5cdFx0XHQnbXlDb21wdXRlZDIucmVjb21wdXRlKG15Q29tcHV0ZWQxOiAwICsgbXlPYnNlcnZhYmxlMTogMCArIG15T2JzZXJ2YWJsZTI6IDAgPSAwKScsXG5cdFx0XHQnbXlDb21wdXRlZDMucmVjb21wdXRlKG15Q29tcHV0ZWQyOiAwICsgbXlPYnNlcnZhYmxlMTogMCArIG15T2JzZXJ2YWJsZTI6IDAgPSAwKScsXG5cdFx0XHQnbXlBdXRvcnVuLnJ1bihteUNvbXB1dGVkMzogMCknLFxuXHRcdF0pO1xuXG5cdFx0bXlPYnNlcnZhYmxlMS5zZXQoMSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0J215Q29tcHV0ZWQxLnJlY29tcHV0ZShteU9ic2VydmFibGUxOiAxICsgbXlPYnNlcnZhYmxlMjogMCA9IDEpJyxcblx0XHRcdCdteUNvbXB1dGVkMi5yZWNvbXB1dGUobXlDb21wdXRlZDE6IDEgKyBteU9ic2VydmFibGUxOiAxICsgbXlPYnNlcnZhYmxlMjogMCA9IDIpJyxcblx0XHRcdCdteUNvbXB1dGVkMy5yZWNvbXB1dGUobXlDb21wdXRlZDI6IDIgKyBteU9ic2VydmFibGUxOiAxICsgbXlPYnNlcnZhYmxlMjogMCA9IDMpJyxcblx0XHRcdCdteUF1dG9ydW4ucnVuKG15Q29tcHV0ZWQzOiAzKScsXG5cdFx0XSk7XG5cblx0XHR0cmFuc2FjdGlvbigodHgpID0+IHtcblx0XHRcdG15T2JzZXJ2YWJsZTEuc2V0KDIsIHR4KTtcblx0XHRcdG15Q29tcHV0ZWQyLmdldCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215Q29tcHV0ZWQxLnJlY29tcHV0ZShteU9ic2VydmFibGUxOiAyICsgbXlPYnNlcnZhYmxlMjogMCA9IDIpJyxcblx0XHRcdFx0J215Q29tcHV0ZWQyLnJlY29tcHV0ZShteUNvbXB1dGVkMTogMiArIG15T2JzZXJ2YWJsZTE6IDIgKyBteU9ic2VydmFibGUyOiAwID0gNCknLFxuXHRcdFx0XSk7XG5cblx0XHRcdG15T2JzZXJ2YWJsZTEuc2V0KDMsIHR4KTtcblx0XHRcdG15Q29tcHV0ZWQyLmdldCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215Q29tcHV0ZWQxLnJlY29tcHV0ZShteU9ic2VydmFibGUxOiAzICsgbXlPYnNlcnZhYmxlMjogMCA9IDMpJyxcblx0XHRcdFx0J215Q29tcHV0ZWQyLnJlY29tcHV0ZShteUNvbXB1dGVkMTogMyArIG15T2JzZXJ2YWJsZTE6IDMgKyBteU9ic2VydmFibGUyOiAwID0gNiknLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteUNvbXB1dGVkMy5yZWNvbXB1dGUobXlDb21wdXRlZDI6IDYgKyBteU9ic2VydmFibGUxOiAzICsgbXlPYnNlcnZhYmxlMjogMCA9IDkpJyxcblx0XHRcdCdteUF1dG9ydW4ucnVuKG15Q29tcHV0ZWQzOiA5KScsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmcm9tIGV2ZW50JywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gaW5pdCgpOiB7IGxvZzogTG9nOyBzZXRWYWx1ZTogKHZhbHVlOiBudW1iZXIgfCB1bmRlZmluZWQpID0+IHZvaWQ7IG9ic2VydmFibGU6IElPYnNlcnZhYmxlPG51bWJlciB8IHVuZGVmaW5lZD4gfSB7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cblx0XHRcdGxldCB2YWx1ZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gMDtcblx0XHRcdGNvbnN0IGV2ZW50RW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cblx0XHRcdGxldCBpZCA9IDA7XG5cdFx0XHRjb25zdCBvYnNlcnZhYmxlID0gb2JzZXJ2YWJsZUZyb21FdmVudChcblx0XHRcdFx0KGhhbmRsZXIpID0+IHtcblx0XHRcdFx0XHRjb25zdCBjdXJJZCA9IGlkKys7XG5cdFx0XHRcdFx0bG9nLmxvZyhgc3Vic2NyaWJlZCBoYW5kbGVyICR7Y3VySWR9YCk7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGV2ZW50RW1pdHRlci5ldmVudChoYW5kbGVyKTtcblxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGxvZy5sb2coYHVuc3Vic2NyaWJlZCBoYW5kbGVyICR7Y3VySWR9YCk7XG5cdFx0XHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0bG9nLmxvZyhgY29tcHV0ZSB2YWx1ZSAke3ZhbHVlfWApO1xuXHRcdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bG9nLFxuXHRcdFx0XHRzZXRWYWx1ZTogKG5ld1ZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dmFsdWUgPSBuZXdWYWx1ZTtcblx0XHRcdFx0XHRldmVudEVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvYnNlcnZhYmxlLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdIYW5kbGUgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2csIHNldFZhbHVlLCBvYnNlcnZhYmxlIH0gPSBpbml0KCk7XG5cblx0XHRcdHNldFZhbHVlKHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IGF1dG9ydW5EaXNwb3NhYmxlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIE15QXV0b3J1biAqL1xuXHRcdFx0XHRvYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0bG9nLmxvZyhcblx0XHRcdFx0XHRgYXV0b3J1biwgdmFsdWU6ICR7b2JzZXJ2YWJsZS5yZWFkKHJlYWRlcil9YFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdzdWJzY3JpYmVkIGhhbmRsZXIgMCcsXG5cdFx0XHRcdCdjb21wdXRlIHZhbHVlIHVuZGVmaW5lZCcsXG5cdFx0XHRcdCdhdXRvcnVuLCB2YWx1ZTogdW5kZWZpbmVkJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRzZXRWYWx1ZSgxKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J2NvbXB1dGUgdmFsdWUgMScsXG5cdFx0XHRcdCdhdXRvcnVuLCB2YWx1ZTogMSdcblx0XHRcdF0pO1xuXG5cdFx0XHRhdXRvcnVuRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCd1bnN1YnNjcmliZWQgaGFuZGxlciAwJ1xuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdiYXNpYycsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbG9nLCBzZXRWYWx1ZSwgb2JzZXJ2YWJsZSB9ID0gaW5pdCgpO1xuXG5cdFx0XHRjb25zdCBzaG91bGRSZWFkT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnc2hvdWxkUmVhZE9ic2VydmFibGUnLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgYXV0b3J1bkRpc3Bvc2FibGUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gTXlBdXRvcnVuICovXG5cdFx0XHRcdGlmIChzaG91bGRSZWFkT2JzZXJ2YWJsZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRvYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRsb2cubG9nKFxuXHRcdFx0XHRcdFx0YGF1dG9ydW4sIHNob3VsZCByZWFkOiB0cnVlLCB2YWx1ZTogJHtvYnNlcnZhYmxlLnJlYWQocmVhZGVyKX1gXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsb2cubG9nKGBhdXRvcnVuLCBzaG91bGQgcmVhZDogZmFsc2VgKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnc3Vic2NyaWJlZCBoYW5kbGVyIDAnLFxuXHRcdFx0XHQnY29tcHV0ZSB2YWx1ZSAwJyxcblx0XHRcdFx0J2F1dG9ydW4sIHNob3VsZCByZWFkOiB0cnVlLCB2YWx1ZTogMCcsXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gQ2FjaGVkIGdldFxuXHRcdFx0bG9nLmxvZyhgZ2V0IHZhbHVlOiAke29ic2VydmFibGUuZ2V0KCl9YCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgWydnZXQgdmFsdWU6IDAnXSk7XG5cblx0XHRcdHNldFZhbHVlKDEpO1xuXHRcdFx0Ly8gVHJpZ2dlciBhdXRvcnVuLCBubyB1bnN1Yi9zdWJcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdjb21wdXRlIHZhbHVlIDEnLFxuXHRcdFx0XHQnYXV0b3J1biwgc2hvdWxkIHJlYWQ6IHRydWUsIHZhbHVlOiAxJyxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBVbnN1YnNjcmliZSB3aGVuIG5vdCByZWFkXG5cdFx0XHRzaG91bGRSZWFkT2JzZXJ2YWJsZS5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnYXV0b3J1biwgc2hvdWxkIHJlYWQ6IGZhbHNlJyxcblx0XHRcdFx0J3Vuc3Vic2NyaWJlZCBoYW5kbGVyIDAnLFxuXHRcdFx0XSk7XG5cblx0XHRcdHNob3VsZFJlYWRPYnNlcnZhYmxlLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J3N1YnNjcmliZWQgaGFuZGxlciAxJyxcblx0XHRcdFx0J2NvbXB1dGUgdmFsdWUgMScsXG5cdFx0XHRcdCdhdXRvcnVuLCBzaG91bGQgcmVhZDogdHJ1ZSwgdmFsdWU6IDEnLFxuXHRcdFx0XSk7XG5cblx0XHRcdGF1dG9ydW5EaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCd1bnN1YnNjcmliZWQgaGFuZGxlciAxJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0IHdpdGhvdXQgb2JzZXJ2ZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2csIG9ic2VydmFibGUgfSA9IGluaXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cblx0XHRcdGxvZy5sb2coYGdldCB2YWx1ZTogJHtvYnNlcnZhYmxlLmdldCgpfWApO1xuXHRcdFx0Ly8gTm90IGNhY2hlZCBvciBzdWJzY3JpYmVkXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnY29tcHV0ZSB2YWx1ZSAwJyxcblx0XHRcdFx0J2dldCB2YWx1ZTogMCcsXG5cdFx0XHRdKTtcblxuXHRcdFx0bG9nLmxvZyhgZ2V0IHZhbHVlOiAke29ic2VydmFibGUuZ2V0KCl9YCk7XG5cdFx0XHQvLyBTdGlsbCBub3QgY2FjaGVkIG9yIHN1YnNjcmliZWRcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdjb21wdXRlIHZhbHVlIDAnLFxuXHRcdFx0XHQnZ2V0IHZhbHVlOiAwJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGFzdCBvYnNlcnZlciByZW1vdmVkIHdoaWxlIGhhbmRsaW5nIGV2ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2csIHNldFZhbHVlLCBvYnNlcnZhYmxlIH0gPSBpbml0KCk7XG5cdFx0XHRsZXQgZmlyc3RWYWx1ZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZmlyc3RPYnNlcnZlciA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Zmlyc3RWYWx1ZSA9IG9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoZmlyc3RWYWx1ZSA9PT0gMSkge1xuXHRcdFx0XHRcdGZpcnN0T2JzZXJ2ZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGZpcnN0VmFsdWUsIGxvZzogbG9nLmdldEFuZENsZWFyRW50cmllcygpIH0sIHtcblx0XHRcdFx0Zmlyc3RWYWx1ZTogMCxcblx0XHRcdFx0bG9nOiBbXG5cdFx0XHRcdFx0J3N1YnNjcmliZWQgaGFuZGxlciAwJyxcblx0XHRcdFx0XHQnY29tcHV0ZSB2YWx1ZSAwJyxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRzZXRWYWx1ZSgxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBmaXJzdFZhbHVlLCBsb2c6IGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSB9LCB7XG5cdFx0XHRcdGZpcnN0VmFsdWU6IDEsXG5cdFx0XHRcdGxvZzogW1xuXHRcdFx0XHRcdCdjb21wdXRlIHZhbHVlIDEnLFxuXHRcdFx0XHRcdCd1bnN1YnNjcmliZWQgaGFuZGxlciAwJyxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgc2Vjb25kVmFsdWU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNlY29uZE9ic2VydmVyID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRzZWNvbmRWYWx1ZSA9IG9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzZWNvbmRWYWx1ZSwgbG9nOiBsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCkgfSwge1xuXHRcdFx0XHRzZWNvbmRWYWx1ZTogMSxcblx0XHRcdFx0bG9nOiBbXG5cdFx0XHRcdFx0J3N1YnNjcmliZWQgaGFuZGxlciAxJyxcblx0XHRcdFx0XHQnY29tcHV0ZSB2YWx1ZSAxJyxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRzZWNvbmRPYnNlcnZlci5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgWyd1bnN1YnNjcmliZWQgaGFuZGxlciAxJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkaW5nIGRlcml2ZWQgaW4gdHJhbnNhY3Rpb24gdW5zdWJzY3JpYmVzIHVubmVjZXNzYXJ5IG9ic2VydmFibGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblxuXHRcdGNvbnN0IHNob3VsZFJlYWRPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdzaG91bGRSZWFkTXlPYnMxJywgdHJ1ZSk7XG5cdFx0Y29uc3QgbXlPYnMxID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzMScsIDAsIGxvZyk7XG5cdFx0Y29uc3QgbXlDb21wdXRlZCA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlDb21wdXRlZCAqL1xuXHRcdFx0bG9nLmxvZygnbXlDb21wdXRlZC5yZWNvbXB1dGUnKTtcblx0XHRcdGlmIChzaG91bGRSZWFkT2JzZXJ2YWJsZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIG15T2JzMS5yZWFkKHJlYWRlcik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9KTtcblx0XHRkcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteUF1dG9ydW4gKi9cblx0XHRcdGNvbnN0IHZhbHVlID0gbXlDb21wdXRlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRsb2cubG9nKGBteUF1dG9ydW46ICR7dmFsdWV9YCk7XG5cdFx0fSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnbXlDb21wdXRlZC5yZWNvbXB1dGUnLFxuXHRcdFx0J215T2JzMS5maXJzdE9ic2VydmVyQWRkZWQnLFxuXHRcdFx0J215T2JzMS5nZXQnLFxuXHRcdFx0J215QXV0b3J1bjogMCcsXG5cdFx0XSk7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRteU9iczEuc2V0KDEsIHR4KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoWydteU9iczEuc2V0ICh2YWx1ZSAxKSddKSk7XG5cblx0XHRcdHNob3VsZFJlYWRPYnNlcnZhYmxlLnNldChmYWxzZSwgdHgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXSkpO1xuXG5cdFx0XHRteUNvbXB1dGVkLmdldCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215Q29tcHV0ZWQucmVjb21wdXRlJyxcblx0XHRcdFx0J215T2JzMS5sYXN0T2JzZXJ2ZXJSZW1vdmVkJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoWydteUF1dG9ydW46IDEnXSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdm9pZCByZWNvbXB1dGF0aW9uIG9mIGRlcml2ZWRzIHRoYXQgYXJlIG5vIGxvbmdlciByZWFkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblxuXHRcdGNvbnN0IG15T2JzU2hvdWxkUmVhZCA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic1Nob3VsZFJlYWQnLCB0cnVlLCBsb2cpO1xuXHRcdGNvbnN0IG15T2JzMSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9iczEnLCAwLCBsb2cpO1xuXG5cdFx0Y29uc3QgbXlDb21wdXRlZDEgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15Q29tcHV0ZWQxICovXG5cdFx0XHRjb25zdCBteU9iczFWYWwgPSBteU9iczEucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbXlPYnMxVmFsICUgMTA7XG5cdFx0XHRsb2cubG9nKGBteUNvbXB1dGVkMShteU9iczE6ICR7bXlPYnMxVmFsfSk6IENvbXB1dGVkICR7cmVzdWx0fWApO1xuXHRcdFx0cmV0dXJuIG15T2JzMVZhbDtcblx0XHR9KTtcblxuXHRcdGRzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15QXV0b3J1biAqL1xuXHRcdFx0Y29uc3Qgc2hvdWxkUmVhZCA9IG15T2JzU2hvdWxkUmVhZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoc2hvdWxkUmVhZCkge1xuXHRcdFx0XHRjb25zdCB2ID0gbXlDb21wdXRlZDEucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRsb2cubG9nKGBteUF1dG9ydW4oc2hvdWxkUmVhZDogdHJ1ZSwgbXlDb21wdXRlZDE6ICR7dn0pOiBydW5gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxvZy5sb2coYG15QXV0b3J1bihzaG91bGRSZWFkOiBmYWxzZSk6IHJ1bmApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0J215T2JzU2hvdWxkUmVhZC5maXJzdE9ic2VydmVyQWRkZWQnLFxuXHRcdFx0J215T2JzU2hvdWxkUmVhZC5nZXQnLFxuXHRcdFx0J215T2JzMS5maXJzdE9ic2VydmVyQWRkZWQnLFxuXHRcdFx0J215T2JzMS5nZXQnLFxuXHRcdFx0J215Q29tcHV0ZWQxKG15T2JzMTogMCk6IENvbXB1dGVkIDAnLFxuXHRcdFx0J215QXV0b3J1bihzaG91bGRSZWFkOiB0cnVlLCBteUNvbXB1dGVkMTogMCk6IHJ1bicsXG5cdFx0XSk7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRteU9ic1Nob3VsZFJlYWQuc2V0KGZhbHNlLCB0eCk7XG5cdFx0XHRteU9iczEuc2V0KDEsIHR4KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic1Nob3VsZFJlYWQuc2V0ICh2YWx1ZSBmYWxzZSknLFxuXHRcdFx0XHQnbXlPYnMxLnNldCAodmFsdWUgMSknLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0Ly8gbXlDb21wdXRlZDEgc2hvdWxkIG5vdCBiZSByZWNvbXB1dGVkIGhlcmUsIGV2ZW4gdGhvdWdoIGl0cyBkZXBlbmRlbmN5IG15T2JzMSBjaGFuZ2VkIVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnbXlPYnNTaG91bGRSZWFkLmdldCcsXG5cdFx0XHQnbXlBdXRvcnVuKHNob3VsZFJlYWQ6IGZhbHNlKTogcnVuJyxcblx0XHRcdCdteU9iczEubGFzdE9ic2VydmVyUmVtb3ZlZCcsXG5cdFx0XSk7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRteU9ic1Nob3VsZFJlYWQuc2V0KHRydWUsIHR4KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic1Nob3VsZFJlYWQuc2V0ICh2YWx1ZSB0cnVlKScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0J215T2JzU2hvdWxkUmVhZC5nZXQnLFxuXHRcdFx0J215T2JzMS5maXJzdE9ic2VydmVyQWRkZWQnLFxuXHRcdFx0J215T2JzMS5nZXQnLFxuXHRcdFx0J215Q29tcHV0ZWQxKG15T2JzMTogMSk6IENvbXB1dGVkIDEnLFxuXHRcdFx0J215QXV0b3J1bihzaG91bGRSZWFkOiB0cnVlLCBteUNvbXB1dGVkMTogMSk6IHJ1bicsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhdXRvcnVuIHJlcnVuIG9uIG5ldXRyYWwgY2hhbmdlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2F1dG9ydW4gcmVydW5zIG9uIG5ldXRyYWwgb2JzZXJ2YWJsZSBkb3VibGUgY2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdFx0Y29uc3QgbXlPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCAwKTtcblxuXHRcdFx0ZHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteUF1dG9ydW4gKi9cblx0XHRcdFx0bG9nLmxvZyhgbXlBdXRvcnVuLnJ1bihteU9ic2VydmFibGU6ICR7bXlPYnNlcnZhYmxlLnJlYWQocmVhZGVyKX0pYCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgWydteUF1dG9ydW4ucnVuKG15T2JzZXJ2YWJsZTogMCknXSk7XG5cblxuXHRcdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoMiwgdHgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXG5cdFx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoMCwgdHgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgWydteUF1dG9ydW4ucnVuKG15T2JzZXJ2YWJsZTogMCknXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdXRvcnVuIGRvZXMgbm90IHJlcnVuIG9uIGluZGlyZWN0IG5ldXRyYWwgb2JzZXJ2YWJsZSBkb3VibGUgY2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdFx0Y29uc3QgbXlPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCAwKTtcblx0XHRcdGNvbnN0IG15RGVyaXZlZCA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteURlcml2ZWQgKi9cblx0XHRcdFx0Y29uc3QgdmFsID0gbXlPYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0bG9nLmxvZyhgbXlEZXJpdmVkLnJlYWQobXlPYnNlcnZhYmxlOiAke3ZhbH0pYCk7XG5cdFx0XHRcdHJldHVybiB2YWw7XG5cdFx0XHR9KTtcblxuXHRcdFx0ZHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteUF1dG9ydW4gKi9cblx0XHRcdFx0bG9nLmxvZyhgbXlBdXRvcnVuLnJ1bihteURlcml2ZWQ6ICR7bXlEZXJpdmVkLnJlYWQocmVhZGVyKX0pYCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlEZXJpdmVkLnJlYWQobXlPYnNlcnZhYmxlOiAwKScsXG5cdFx0XHRcdCdteUF1dG9ydW4ucnVuKG15RGVyaXZlZDogMCknXG5cdFx0XHRdKTtcblxuXHRcdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoMiwgdHgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXG5cdFx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoMCwgdHgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlEZXJpdmVkLnJlYWQobXlPYnNlcnZhYmxlOiAwKSdcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXV0b3J1biByZXJ1bnMgb24gaW5kaXJlY3QgbmV1dHJhbCBvYnNlcnZhYmxlIGRvdWJsZSBjaGFuZ2Ugd2hlbiBjaGFuZ2VzIHByb3BhZ2F0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlJywgMCk7XG5cdFx0XHRjb25zdCBteURlcml2ZWQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlEZXJpdmVkICovXG5cdFx0XHRcdGNvbnN0IHZhbCA9IG15T2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGxvZy5sb2coYG15RGVyaXZlZC5yZWFkKG15T2JzZXJ2YWJsZTogJHt2YWx9KWApO1xuXHRcdFx0XHRyZXR1cm4gdmFsO1xuXHRcdFx0fSk7XG5cblx0XHRcdGRzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuICovXG5cdFx0XHRcdGxvZy5sb2coYG15QXV0b3J1bi5ydW4obXlEZXJpdmVkOiAke215RGVyaXZlZC5yZWFkKHJlYWRlcil9KWApO1xuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215RGVyaXZlZC5yZWFkKG15T2JzZXJ2YWJsZTogMCknLFxuXHRcdFx0XHQnbXlBdXRvcnVuLnJ1bihteURlcml2ZWQ6IDApJ1xuXHRcdFx0XSk7XG5cblx0XHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0XHRteU9ic2VydmFibGUuc2V0KDIsIHR4KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblxuXHRcdFx0XHRteURlcml2ZWQuZ2V0KCk7IC8vIFRoaXMgbWFya3MgdGhlIGF1dG8tcnVuIGFzIGNoYW5nZWRcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0XHQnbXlEZXJpdmVkLnJlYWQobXlPYnNlcnZhYmxlOiAyKSdcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0bXlPYnNlcnZhYmxlLnNldCgwLCB0eCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteURlcml2ZWQucmVhZChteU9ic2VydmFibGU6IDApJyxcblx0XHRcdFx0J215QXV0b3J1bi5ydW4obXlEZXJpdmVkOiAwKSdcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWxmLWRpc3Bvc2luZyBhdXRvcnVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblxuXHRcdGNvbnN0IG9ic2VydmFibGUxID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZTEnLCAwLCBsb2cpO1xuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZTIgPSBuZXcgTG9nZ2luZ09ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlMicsIDAsIGxvZyk7XG5cdFx0Y29uc3QgbXlPYnNlcnZhYmxlMyA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUzJywgMCwgbG9nKTtcblxuXHRcdGNvbnN0IGQgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIGF1dG9ydW4gKi9cblx0XHRcdGlmIChvYnNlcnZhYmxlMS5yZWFkKHJlYWRlcikgPj0gMikge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHRcdCdteU9ic2VydmFibGUxLnNldCAodmFsdWUgMiknLFxuXHRcdFx0XHRcdCdteU9ic2VydmFibGUxLmdldCcsXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdG15T2JzZXJ2YWJsZTIucmVhZChyZWFkZXIpO1xuXHRcdFx0XHQvLyBGaXJzdCB0aW1lIHRoaXMgb2JzZXJ2YWJsZSBpcyByZWFkXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdFx0J215T2JzZXJ2YWJsZTIuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdFx0XHQnbXlPYnNlcnZhYmxlMi5nZXQnLFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdFx0Ly8gRGlzcG9zaW5nIHJlbW92ZXMgYWxsIG9ic2VydmVyc1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHRcdCdteU9ic2VydmFibGUxLmxhc3RPYnNlcnZlclJlbW92ZWQnLFxuXHRcdFx0XHRcdCdteU9ic2VydmFibGUyLmxhc3RPYnNlcnZlclJlbW92ZWQnLFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRteU9ic2VydmFibGUzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Ly8gVGhpcyBkb2VzIG5vdCBzdWJzY3JpYmUgdGhlIG9ic2VydmFibGUsIGJlY2F1c2UgdGhlIGF1dG9ydW4gaXMgZGlzcG9zZWRcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0XHQnbXlPYnNlcnZhYmxlMy5nZXQnLFxuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0J215T2JzZXJ2YWJsZTEuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdCdteU9ic2VydmFibGUxLmdldCcsXG5cdFx0XSk7XG5cblx0XHRvYnNlcnZhYmxlMS5zZXQoMSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0J215T2JzZXJ2YWJsZTEuc2V0ICh2YWx1ZSAxKScsXG5cdFx0XHQnbXlPYnNlcnZhYmxlMS5nZXQnLFxuXHRcdF0pO1xuXG5cdFx0b2JzZXJ2YWJsZTEuc2V0KDIsIHVuZGVmaW5lZCk7XG5cdFx0Ly8gU2VlIGFzc2VydHMgaW4gdGhlIGF1dG9ydW5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtdKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5naW5nIG9ic2VydmFibGVzIGluIGVuZFVwZGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cblx0XHRjb25zdCBteU9ic2VydmFibGUxID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZTEnLCAwLCBsb2cpO1xuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZTIgPSBuZXcgTG9nZ2luZ09ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlMicsIDAsIGxvZyk7XG5cblx0XHRjb25zdCBteURlcml2ZWQxID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteURlcml2ZWQxICovXG5cdFx0XHRjb25zdCB2YWwgPSBteU9ic2VydmFibGUxLnJlYWQocmVhZGVyKTtcblx0XHRcdGxvZy5sb2coYG15RGVyaXZlZDEucmVhZChteU9ic2VydmFibGU6ICR7dmFsfSlgKTtcblx0XHRcdHJldHVybiB2YWw7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBteURlcml2ZWQyID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteURlcml2ZWQyICovXG5cdFx0XHRjb25zdCB2YWwgPSBteU9ic2VydmFibGUyLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICh2YWwgPT09IDEpIHtcblx0XHRcdFx0bXlEZXJpdmVkMS5yZWFkKHJlYWRlcik7XG5cdFx0XHR9XG5cdFx0XHRsb2cubG9nKGBteURlcml2ZWQyLnJlYWQobXlPYnNlcnZhYmxlOiAke3ZhbH0pYCk7XG5cdFx0XHRyZXR1cm4gdmFsO1xuXHRcdH0pO1xuXG5cdFx0ZHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuICovXG5cdFx0XHRjb25zdCBteURlcml2ZWQxVmFsID0gbXlEZXJpdmVkMS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBteURlcml2ZWQyVmFsID0gbXlEZXJpdmVkMi5yZWFkKHJlYWRlcik7XG5cdFx0XHRsb2cubG9nKGBteUF1dG9ydW4ucnVuKG15RGVyaXZlZDE6ICR7bXlEZXJpdmVkMVZhbH0sIG15RGVyaXZlZDI6ICR7bXlEZXJpdmVkMlZhbH0pYCk7XG5cdFx0fSkpO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0bXlPYnNlcnZhYmxlMi5zZXQoMSwgdHgpO1xuXHRcdFx0Ly8gZW5kIHVwZGF0ZSBvZiB0aGlzIG9ic2VydmFibGUgd2lsbCB0cmlnZ2VyIGVuZFVwZGF0ZSBvZiBteURlcml2ZWQxIGFuZFxuXHRcdFx0Ly8gdGhlIGF1dG9ydW4gYW5kIHRoZSBhdXRvcnVuIHdpbGwgYWRkIG15RGVyaXZlZDIgYXMgb2JzZXJ2ZXIgdG8gbXlEZXJpdmVkMVxuXHRcdFx0bXlPYnNlcnZhYmxlMS5zZXQoMSwgdHgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXQgZGVwZW5kZW5jeSBpbiBkZXJpdmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblxuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCAwLCBsb2cpO1xuXHRcdGNvbnN0IG15Q29tcHV0ZWQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15Q29tcHV0ZWQgKi9cblx0XHRcdGxldCB2YWx1ZSA9IG15T2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBvcmlnVmFsdWUgPSB2YWx1ZTtcblx0XHRcdGxvZy5sb2coYG15Q29tcHV0ZWQobXlPYnNlcnZhYmxlOiAke29yaWdWYWx1ZX0pOiBzdGFydCBjb21wdXRpbmdgKTtcblx0XHRcdGlmICh2YWx1ZSAlIDMgIT09IDApIHtcblx0XHRcdFx0dmFsdWUrKztcblx0XHRcdFx0bXlPYnNlcnZhYmxlLnNldCh2YWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdGxvZy5sb2coYG15Q29tcHV0ZWQobXlPYnNlcnZhYmxlOiAke29yaWdWYWx1ZX0pOiBmaW5pc2hlZCBjb21wdXRpbmdgKTtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9KTtcblxuXHRcdGRzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15QXV0b3J1biAqL1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBteUNvbXB1dGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdGxvZy5sb2coYG15QXV0b3J1bihteUNvbXB1dGVkOiAke3ZhbHVlfSlgKTtcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteU9ic2VydmFibGUuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteUNvbXB1dGVkKG15T2JzZXJ2YWJsZTogMCk6IHN0YXJ0IGNvbXB1dGluZycsXG5cdFx0XHQnbXlDb21wdXRlZChteU9ic2VydmFibGU6IDApOiBmaW5pc2hlZCBjb21wdXRpbmcnLFxuXHRcdFx0J215QXV0b3J1bihteUNvbXB1dGVkOiAwKSdcblx0XHRdKTtcblxuXHRcdG15T2JzZXJ2YWJsZS5zZXQoMSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIDEpJyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteUNvbXB1dGVkKG15T2JzZXJ2YWJsZTogMSk6IHN0YXJ0IGNvbXB1dGluZycsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgMiknLFxuXHRcdFx0J215Q29tcHV0ZWQobXlPYnNlcnZhYmxlOiAxKTogZmluaXNoZWQgY29tcHV0aW5nJyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteUNvbXB1dGVkKG15T2JzZXJ2YWJsZTogMik6IHN0YXJ0IGNvbXB1dGluZycsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgMyknLFxuXHRcdFx0J215Q29tcHV0ZWQobXlPYnNlcnZhYmxlOiAyKTogZmluaXNoZWQgY29tcHV0aW5nJyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteUNvbXB1dGVkKG15T2JzZXJ2YWJsZTogMyk6IHN0YXJ0IGNvbXB1dGluZycsXG5cdFx0XHQnbXlDb21wdXRlZChteU9ic2VydmFibGU6IDMpOiBmaW5pc2hlZCBjb21wdXRpbmcnLFxuXHRcdFx0J215QXV0b3J1bihteUNvbXB1dGVkOiAzKScsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldCBkZXBlbmRlbmN5IGluIGF1dG9ydW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCAwLCBsb2cpO1xuXG5cdFx0ZHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuICovXG5cdFx0XHRjb25zdCB2YWx1ZSA9IG15T2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRsb2cubG9nKGBteUF1dG9ydW4obXlPYnNlcnZhYmxlOiAke3ZhbHVlfSk6IHN0YXJ0YCk7XG5cdFx0XHRpZiAodmFsdWUgIT09IDAgJiYgdmFsdWUgPCA0KSB7XG5cdFx0XHRcdG15T2JzZXJ2YWJsZS5zZXQodmFsdWUgKyAxLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0bG9nLmxvZyhgbXlBdXRvcnVuKG15T2JzZXJ2YWJsZTogJHt2YWx1ZX0pOiBlbmRgKTtcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteU9ic2VydmFibGUuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteUF1dG9ydW4obXlPYnNlcnZhYmxlOiAwKTogc3RhcnQnLFxuXHRcdFx0J215QXV0b3J1bihteU9ic2VydmFibGU6IDApOiBlbmQnLFxuXHRcdF0pO1xuXG5cdFx0bXlPYnNlcnZhYmxlLnNldCgxLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgMSknLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0J215QXV0b3J1bihteU9ic2VydmFibGU6IDEpOiBzdGFydCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgMiknLFxuXHRcdFx0J215QXV0b3J1bihteU9ic2VydmFibGU6IDEpOiBlbmQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0J215QXV0b3J1bihteU9ic2VydmFibGU6IDIpOiBzdGFydCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgMyknLFxuXHRcdFx0J215QXV0b3J1bihteU9ic2VydmFibGU6IDIpOiBlbmQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0J215QXV0b3J1bihteU9ic2VydmFibGU6IDMpOiBzdGFydCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgNCknLFxuXHRcdFx0J215QXV0b3J1bihteU9ic2VydmFibGU6IDMpOiBlbmQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0J215QXV0b3J1bihteU9ic2VydmFibGU6IDQpOiBzdGFydCcsXG5cdFx0XHQnbXlBdXRvcnVuKG15T2JzZXJ2YWJsZTogNCk6IGVuZCcsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldCBpbiB0cmFuc2FjdGlvbiBiZXR3ZWVuIHNldHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCAwLCBsb2cpO1xuXG5cdFx0Y29uc3QgbXlEZXJpdmVkMSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlEZXJpdmVkMSAqL1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBteU9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0bG9nLmxvZyhgbXlEZXJpdmVkMShteU9ic2VydmFibGU6ICR7dmFsdWV9KTogc3RhcnQgY29tcHV0aW5nYCk7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBteURlcml2ZWQyID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteURlcml2ZWQyICovXG5cdFx0XHRjb25zdCB2YWx1ZSA9IG15RGVyaXZlZDEucmVhZChyZWFkZXIpO1xuXHRcdFx0bG9nLmxvZyhgbXlEZXJpdmVkMihteURlcml2ZWQxOiAke3ZhbHVlfSk6IHN0YXJ0IGNvbXB1dGluZ2ApO1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0pO1xuXG5cdFx0ZHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuICovXG5cdFx0XHRjb25zdCB2YWx1ZSA9IG15RGVyaXZlZDIucmVhZChyZWFkZXIpO1xuXHRcdFx0bG9nLmxvZyhgbXlBdXRvcnVuKG15RGVyaXZlZDI6ICR7dmFsdWV9KWApO1xuXHRcdH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0J215T2JzZXJ2YWJsZS5maXJzdE9ic2VydmVyQWRkZWQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0J215RGVyaXZlZDEobXlPYnNlcnZhYmxlOiAwKTogc3RhcnQgY29tcHV0aW5nJyxcblx0XHRcdCdteURlcml2ZWQyKG15RGVyaXZlZDE6IDApOiBzdGFydCBjb21wdXRpbmcnLFxuXHRcdFx0J215QXV0b3J1bihteURlcml2ZWQyOiAwKScsXG5cdFx0XSk7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRteU9ic2VydmFibGUuc2V0KDEsIHR4KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUuc2V0ICh2YWx1ZSAxKScsXG5cdFx0XHRdKTtcblxuXHRcdFx0bXlEZXJpdmVkMi5nZXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdFx0J215RGVyaXZlZDEobXlPYnNlcnZhYmxlOiAxKTogc3RhcnQgY29tcHV0aW5nJyxcblx0XHRcdFx0J215RGVyaXZlZDIobXlEZXJpdmVkMTogMSk6IHN0YXJ0IGNvbXB1dGluZycsXG5cdFx0XHRdKTtcblxuXHRcdFx0bXlPYnNlcnZhYmxlLnNldCgyLCB0eCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgMiknLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteURlcml2ZWQxKG15T2JzZXJ2YWJsZTogMik6IHN0YXJ0IGNvbXB1dGluZycsXG5cdFx0XHQnbXlEZXJpdmVkMihteURlcml2ZWQxOiAyKTogc3RhcnQgY29tcHV0aW5nJyxcblx0XHRcdCdteUF1dG9ydW4obXlEZXJpdmVkMjogMiknLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWc6IERvbnQgcmVzZXQgc3RhdGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRjb25zdCBteU9ic2VydmFibGUxID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZTEnLCAwLCBsb2cpO1xuXG5cdFx0Y29uc3QgbXlPYnNlcnZhYmxlMiA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUyJywgMCwgbG9nKTtcblx0XHRjb25zdCBteURlcml2ZWQyID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteURlcml2ZWQyICovXG5cdFx0XHRjb25zdCB2YWwgPSBteU9ic2VydmFibGUyLnJlYWQocmVhZGVyKTtcblx0XHRcdGxvZy5sb2coYG15RGVyaXZlZDIuY29tcHV0ZWQobXlPYnNlcnZhYmxlMjogJHt2YWx9KWApO1xuXHRcdFx0cmV0dXJuIHZhbCAlIDEwO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbXlEZXJpdmVkMyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlEZXJpdmVkMyAqL1xuXHRcdFx0Y29uc3QgdmFsMSA9IG15T2JzZXJ2YWJsZTEucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgdmFsMiA9IG15RGVyaXZlZDIucmVhZChyZWFkZXIpO1xuXHRcdFx0bG9nLmxvZyhgbXlEZXJpdmVkMy5jb21wdXRlZChteURlcml2ZWQxOiAke3ZhbDF9LCBteURlcml2ZWQyOiAke3ZhbDJ9KWApO1xuXHRcdFx0cmV0dXJuIGAke3ZhbDF9ICsgJHt2YWwyfWA7XG5cdFx0fSk7XG5cblx0XHRkcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteUF1dG9ydW4gKi9cblx0XHRcdGNvbnN0IHZhbCA9IG15RGVyaXZlZDMucmVhZChyZWFkZXIpO1xuXHRcdFx0bG9nLmxvZyhgbXlBdXRvcnVuKG15RGVyaXZlZDM6ICR7dmFsfSlgKTtcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteU9ic2VydmFibGUxLmZpcnN0T2JzZXJ2ZXJBZGRlZCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlMS5nZXQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZTIuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdCdteU9ic2VydmFibGUyLmdldCcsXG5cdFx0XHQnbXlEZXJpdmVkMi5jb21wdXRlZChteU9ic2VydmFibGUyOiAwKScsXG5cdFx0XHQnbXlEZXJpdmVkMy5jb21wdXRlZChteURlcml2ZWQxOiAwLCBteURlcml2ZWQyOiAwKScsXG5cdFx0XHQnbXlBdXRvcnVuKG15RGVyaXZlZDM6IDAgKyAwKScsXG5cdFx0XSk7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRteU9ic2VydmFibGUxLnNldCgxLCB0eCk7IC8vIE1hcmsgbXlEZXJpdmVkIDMgYXMgc3RhbGVcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUxLnNldCAodmFsdWUgMSknLFxuXHRcdFx0XSk7XG5cblx0XHRcdG15T2JzZXJ2YWJsZTIuc2V0KDEwLCB0eCk7IC8vIFRoaXMgaXMgYSBub24tY2hhbmdlLiBteURlcml2ZWQzIHNob3VsZCBub3QgYmUgbWFya2VkIGFzIHBvc3NpYmx5LWRlcGVkZW5jeS1jaGFuZ2VkIVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215T2JzZXJ2YWJsZTIuc2V0ICh2YWx1ZSAxMCknLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteU9ic2VydmFibGUxLmdldCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlMi5nZXQnLFxuXHRcdFx0J215RGVyaXZlZDIuY29tcHV0ZWQobXlPYnNlcnZhYmxlMjogMTApJyxcblx0XHRcdCdteURlcml2ZWQzLmNvbXB1dGVkKG15RGVyaXZlZDE6IDEsIG15RGVyaXZlZDI6IDApJyxcblx0XHRcdCdteUF1dG9ydW4obXlEZXJpdmVkMzogMSArIDApJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYnVnOiBBZGQgb2JzZXJ2YWJsZSBpbiBlbmRVcGRhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbXlPYnNlcnZhYmxlMSA9IG9ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlMScsIDApO1xuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZTIgPSBvYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZTInLCAwKTtcblxuXHRcdGNvbnN0IG15RGVyaXZlZDEgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15RGVyaXZlZDEgKi9cblx0XHRcdHJldHVybiBteU9ic2VydmFibGUxLnJlYWQocmVhZGVyKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG15RGVyaXZlZDIgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15RGVyaXZlZDIgKi9cblx0XHRcdHJldHVybiBteU9ic2VydmFibGUyLnJlYWQocmVhZGVyKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG15RGVyaXZlZEExID0gZGVyaXZlZChyZWFkZXIgPT4gLyoqIEBkZXNjcmlwdGlvbiBteURlcml2ZWRBMSAqLyB7XG5cdFx0XHRjb25zdCBkMSA9IG15RGVyaXZlZDEucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGQxID09PSAxKSB7XG5cdFx0XHRcdC8vIFRoaXMgYWRkcyBhbiBvYnNlcnZlciB3aGlsZSBteURlcml2ZWQgaXMgc3RpbGwgaW4gdXBkYXRlIG1vZGUuXG5cdFx0XHRcdC8vIFdoZW4gbXlEZXJpdmVkIGV4aXRzIHVwZGF0ZSBtb2RlLCB0aGUgb2JzZXJ2ZXIgc2hvdWxkbid0IHJlY2VpdmVcblx0XHRcdFx0Ly8gbW9yZSBlbmRVcGRhdGUgdGhhbiBiZWdpblVwZGF0ZSBjYWxscy5cblx0XHRcdFx0bXlEZXJpdmVkMi5yZWFkKHJlYWRlcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRkcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteUF1dG9ydW4xICovXG5cdFx0XHRteURlcml2ZWRBMS5yZWFkKHJlYWRlcik7XG5cdFx0fSkpO1xuXG5cdFx0ZHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuMiAqL1xuXHRcdFx0bXlEZXJpdmVkMi5yZWFkKHJlYWRlcik7XG5cdFx0fSkpO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0bXlPYnNlcnZhYmxlMS5zZXQoMSwgdHgpO1xuXHRcdFx0bXlPYnNlcnZhYmxlMi5zZXQoMSwgdHgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWc6IGZyb21PYnNlcnZhYmxlTGlnaHQgZG9lc250IHN1YnNjcmliZScsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0Y29uc3QgbXlPYnNlcnZhYmxlID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZScsIDAsIGxvZyk7XG5cblx0XHRjb25zdCBteURlcml2ZWQgPSBkZXJpdmVkKHJlYWRlciA9PiAvKiogQGRlc2NyaXB0aW9uIG15RGVyaXZlZCAqLyB7XG5cdFx0XHRjb25zdCB2YWwgPSBteU9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0bG9nLmxvZyhgbXlEZXJpdmVkLmNvbXB1dGVkKG15T2JzZXJ2YWJsZTI6ICR7dmFsfSlgKTtcblx0XHRcdHJldHVybiB2YWwgJSAxMDtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGUgPSBFdmVudC5mcm9tT2JzZXJ2YWJsZUxpZ2h0KG15RGVyaXZlZCk7XG5cdFx0bG9nLmxvZygnZXZlbnQgY3JlYXRlZCcpO1xuXHRcdGUoKCkgPT4ge1xuXHRcdFx0bG9nLmxvZygnZXZlbnQgZmlyZWQnKTtcblx0XHR9KTtcblxuXHRcdG15T2JzZXJ2YWJsZS5zZXQoMSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnZXZlbnQgY3JlYXRlZCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmZpcnN0T2JzZXJ2ZXJBZGRlZCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHQnbXlEZXJpdmVkLmNvbXB1dGVkKG15T2JzZXJ2YWJsZTI6IDApJyxcblx0XHRcdCdteU9ic2VydmFibGUuc2V0ICh2YWx1ZSAxKScsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHQnbXlEZXJpdmVkLmNvbXB1dGVkKG15T2JzZXJ2YWJsZTI6IDEpJyxcblx0XHRcdCdldmVudCBmaXJlZCcsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZzogRXZlbnQuZnJvbU9ic2VydmFibGUgYWx3YXlzIHNob3VsZCBnZXQgZXZlbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRsZXQgaSA9IDA7XG5cdFx0Y29uc3Qgb2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudChlbWl0dGVyLmV2ZW50LCAoKSA9PiBpKTtcblxuXHRcdGkrKztcblx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cblx0XHRjb25zdCBldnQyID0gRXZlbnQuZnJvbU9ic2VydmFibGUob2JzKTtcblx0XHRjb25zdCBkID0gZXZ0MihlID0+IHtcblx0XHRcdGxvZy5sb2coYGV2ZW50IGZpcmVkICR7ZX1gKTtcblx0XHR9KTtcblxuXHRcdGkrKztcblx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnZXZlbnQgZmlyZWQgMiddKTtcblxuXHRcdGkrKztcblx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnZXZlbnQgZmlyZWQgMyddKTtcblxuXHRcdGQuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb250IHJ1biBhdXRvcnVuIGFmdGVyIGRpc3Bvc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCAwLCBsb2cpO1xuXG5cdFx0Y29uc3QgZCA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gdXBkYXRlICovXG5cdFx0XHRjb25zdCB2ID0gbXlPYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdGxvZy5sb2coJ2F1dG9ydW4sIG15T2JzZXJ2YWJsZTonICsgdik7XG5cdFx0fSk7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRteU9ic2VydmFibGUuc2V0KDEsIHR4KTtcblx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteU9ic2VydmFibGUuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdhdXRvcnVuLCBteU9ic2VydmFibGU6MCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgMSknLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5sYXN0T2JzZXJ2ZXJSZW1vdmVkJyxcblx0XHRdKTtcblx0fSk7XG5cblx0c3VpdGUoJ3dhaXRGb3JTdGF0ZScsICgpID0+IHtcblx0XHR0ZXN0KCdyZXNvbHZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdFx0Y29uc3QgbXlPYnNlcnZhYmxlID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZScsIHsgc3RhdGU6ICdpbml0aWFsaXppbmcnIGFzICdpbml0aWFsaXppbmcnIHwgJ3JlYWR5JyB8ICdlcnJvcicgfSwgbG9nKTtcblxuXHRcdFx0Y29uc3QgcCA9IHdhaXRGb3JTdGF0ZShteU9ic2VydmFibGUsIHAgPT4gcC5zdGF0ZSA9PT0gJ3JlYWR5JywgcCA9PiBwLnN0YXRlID09PSAnZXJyb3InKS50aGVuKHIgPT4ge1xuXHRcdFx0XHRsb2cubG9nKGByZXNvbHZlZCAke0pTT04uc3RyaW5naWZ5KHIpfWApO1xuXHRcdFx0fSwgKGVycikgPT4ge1xuXHRcdFx0XHRsb2cubG9nKGByZWplY3RlZCAke0pTT04uc3RyaW5naWZ5KGVycil9YCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5maXJzdE9ic2VydmVyQWRkZWQnLFxuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHRdKTtcblxuXHRcdFx0bXlPYnNlcnZhYmxlLnNldCh7IHN0YXRlOiAncmVhZHknIH0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUuc2V0ICh2YWx1ZSBbb2JqZWN0IE9iamVjdF0pJyxcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLmxhc3RPYnNlcnZlclJlbW92ZWQnLFxuXHRcdFx0XSk7XG5cblx0XHRcdGF3YWl0IHA7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdyZXNvbHZlZCB7XFxcInN0YXRlXFxcIjpcXFwicmVhZHlcXFwifScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmVJbW1lZGlhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0XHRjb25zdCBteU9ic2VydmFibGUgPSBuZXcgTG9nZ2luZ09ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlJywgeyBzdGF0ZTogJ3JlYWR5JyBhcyAnaW5pdGlhbGl6aW5nJyB8ICdyZWFkeScgfCAnZXJyb3InIH0sIGxvZyk7XG5cblx0XHRcdGNvbnN0IHAgPSB3YWl0Rm9yU3RhdGUobXlPYnNlcnZhYmxlLCBwID0+IHAuc3RhdGUgPT09ICdyZWFkeScsIHAgPT4gcC5zdGF0ZSA9PT0gJ2Vycm9yJykudGhlbihyID0+IHtcblx0XHRcdFx0bG9nLmxvZyhgcmVzb2x2ZWQgJHtKU09OLnN0cmluZ2lmeShyKX1gKTtcblx0XHRcdH0sIChlcnIpID0+IHtcblx0XHRcdFx0bG9nLmxvZyhgcmVqZWN0ZWQgJHtKU09OLnN0cmluZ2lmeShlcnIpfWApO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLmxhc3RPYnNlcnZlclJlbW92ZWQnLFxuXHRcdFx0XSk7XG5cblx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoeyBzdGF0ZTogJ2Vycm9yJyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgW29iamVjdCBPYmplY3RdKScsXG5cdFx0XHRdKTtcblxuXHRcdFx0YXdhaXQgcDtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J3Jlc29sdmVkIHtcXFwic3RhdGVcXFwiOlxcXCJyZWFkeVxcXCJ9Jyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdFx0Y29uc3QgbXlPYnNlcnZhYmxlID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZScsIHsgc3RhdGU6ICdpbml0aWFsaXppbmcnIGFzICdpbml0aWFsaXppbmcnIHwgJ3JlYWR5JyB8ICdlcnJvcicgfSwgbG9nKTtcblxuXHRcdFx0Y29uc3QgcCA9IHdhaXRGb3JTdGF0ZShteU9ic2VydmFibGUsIHAgPT4gcC5zdGF0ZSA9PT0gJ3JlYWR5JywgcCA9PiBwLnN0YXRlID09PSAnZXJyb3InKS50aGVuKHIgPT4ge1xuXHRcdFx0XHRsb2cubG9nKGByZXNvbHZlZCAke0pTT04uc3RyaW5naWZ5KHIpfWApO1xuXHRcdFx0fSwgKGVycikgPT4ge1xuXHRcdFx0XHRsb2cubG9nKGByZWplY3RlZCAke0pTT04uc3RyaW5naWZ5KGVycil9YCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5maXJzdE9ic2VydmVyQWRkZWQnLFxuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHRdKTtcblxuXHRcdFx0bXlPYnNlcnZhYmxlLnNldCh7IHN0YXRlOiAnZXJyb3InIH0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUuc2V0ICh2YWx1ZSBbb2JqZWN0IE9iamVjdF0pJyxcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLmxhc3RPYnNlcnZlclJlbW92ZWQnLFxuXHRcdFx0XSk7XG5cblx0XHRcdGF3YWl0IHA7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdyZWplY3RlZCB7XFxcInN0YXRlXFxcIjpcXFwiZXJyb3JcXFwifSdcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVyaXZlZCBhcyBsYXp5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0XHRsZXQgaSA9IDA7XG5cdFx0XHRjb25zdCBkID0gZGVyaXZlZERpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpZCA9IGkrKztcblx0XHRcdFx0bG9nLmxvZygnbXlEZXJpdmVkICcgKyBpZCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gbG9nLmxvZyhgZGlzcG9zZWQgJHtpZH1gKVxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cblx0XHRcdGQuZ2V0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgWydteURlcml2ZWQgMCcsICdkaXNwb3NlZCAwJ10pO1xuXHRcdFx0ZC5nZXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbJ215RGVyaXZlZCAxJywgJ2Rpc3Bvc2VkIDEnXSk7XG5cblx0XHRcdGQua2VlcE9ic2VydmVkKHN0b3JlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cdFx0XHRkLmdldCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnbXlEZXJpdmVkIDInXSk7XG5cdFx0XHRkLmdldCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblxuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgWydkaXNwb3NlZCAyJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvYnNlcnZhYmxlVmFsdWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZTEgPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPignbXlPYnNlcnZhYmxlMScsIDApO1xuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZTIgPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyLCB7IG1lc3NhZ2U6IHN0cmluZyB9PignbXlPYnNlcnZhYmxlMicsIDApO1xuXG5cdFx0Y29uc3QgZCA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gdXBkYXRlICovXG5cdFx0XHRjb25zdCB2MSA9IG15T2JzZXJ2YWJsZTEucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgdjIgPSBteU9ic2VydmFibGUyLnJlYWQocmVhZGVyKTtcblx0XHRcdGxvZy5sb2coJ2F1dG9ydW4sIG15T2JzZXJ2YWJsZTE6JyArIHYxICsgJywgbXlPYnNlcnZhYmxlMjonICsgdjIpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdhdXRvcnVuLCBteU9ic2VydmFibGUxOjAsIG15T2JzZXJ2YWJsZTI6MCdcblx0XHRdKTtcblxuXHRcdC8vIERvZXNuJ3QgdHJpZ2dlciB0aGUgYXV0b3J1biwgYmVjYXVzZSBubyBkZWx0YSB3YXMgcHJvdmlkZWQgYW5kIHRoZSB2YWx1ZSBkaWQgbm90IGNoYW5nZVxuXHRcdG15T2JzZXJ2YWJsZTEuc2V0KDAsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdF0pO1xuXG5cdFx0Ly8gVHJpZ2dlcnMgdGhlIGF1dG9ydW4uIFRoZSB2YWx1ZSBkaWQgbm90IGNoYW5nZSwgYnV0IGEgZGVsdGEgdmFsdWUgd2FzIHByb3ZpZGVkXG5cdFx0bXlPYnNlcnZhYmxlMi5zZXQoMCwgdW5kZWZpbmVkLCB7IG1lc3NhZ2U6ICdjaGFuZ2UxJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnYXV0b3J1biwgbXlPYnNlcnZhYmxlMTowLCBteU9ic2VydmFibGUyOjAnXG5cdFx0XSk7XG5cblx0XHRkLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0c3VpdGUoJ2F1dG9ydW4gZXJyb3IgaGFuZGxpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaW1tZWRpYXRlIHRocm93JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXG5cdFx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKGUgPT4ge1xuXHRcdFx0XHRsb2cubG9nKGBlcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgbXlPYnNlcnZhYmxlID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZScsIDAsIGxvZyk7XG5cblx0XHRcdGNvbnN0IGQgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdG15T2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignZm9vYmFyJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5maXJzdE9ic2VydmVyQWRkZWQnLFxuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHRcdCdlcnJvcjogZm9vYmFyJ1xuXHRcdFx0XSk7XG5cblx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoMSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIDEpJyxcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0XHQnZXJyb3I6IGZvb2JhcicsXG5cdFx0XHRdKTtcblxuXHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsYXRlIHRocm93JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXG5cdFx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKGUgPT4ge1xuXHRcdFx0XHRsb2cubG9nKGBlcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgbXlPYnNlcnZhYmxlID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZScsIDAsIGxvZyk7XG5cblx0XHRcdGNvbnN0IGQgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gbXlPYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKHZhbHVlID49IDEpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Zvb2JhcicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5maXJzdE9ic2VydmVyQWRkZWQnLFxuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHRdKTtcblxuXHRcdFx0bXlPYnNlcnZhYmxlLnNldCgxLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgMSknLFxuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHRcdCdlcnJvcjogZm9vYmFyJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRteU9ic2VydmFibGUuc2V0KDIsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUuc2V0ICh2YWx1ZSAyKScsXG5cdFx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdFx0J2Vycm9yOiBmb29iYXInLFxuXHRcdFx0XSk7XG5cblx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSBzaG91bGQgd29yayB3aGVuIGEgZGVwZW5kZW5jeSBzZXRzIGFuIG9ic2VydmFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXG5cdFx0Y29uc3QgbXlPYnNlcnZhYmxlID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZScsIDAsIGxvZyk7XG5cblx0XHRsZXQgc2hvdWxkVXBkYXRlID0gdHJ1ZTtcblxuXHRcdGNvbnN0IG15RGVyaXZlZCA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlEZXJpdmVkICovXG5cblx0XHRcdGxvZy5sb2coJ215RGVyaXZlZC5jb21wdXRlZCBzdGFydCcpO1xuXG5cdFx0XHRjb25zdCB2YWwgPSBteU9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAoc2hvdWxkVXBkYXRlKSB7XG5cdFx0XHRcdHNob3VsZFVwZGF0ZSA9IGZhbHNlO1xuXHRcdFx0XHRteU9ic2VydmFibGUuc2V0KDEsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdGxvZy5sb2coJ215RGVyaXZlZC5jb21wdXRlZCBlbmQnKTtcblxuXHRcdFx0cmV0dXJuIHZhbDtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW10pKTtcblxuXHRcdG15RGVyaXZlZC5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZShzdG9yZSwgdmFsID0+IHtcblx0XHRcdGxvZy5sb2coYHJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlLCBteURlcml2ZWQ6ICR7dmFsfWApO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteURlcml2ZWQuY29tcHV0ZWQgc3RhcnQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5maXJzdE9ic2VydmVyQWRkZWQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIDEpJyxcblx0XHRcdCdteURlcml2ZWQuY29tcHV0ZWQgZW5kJyxcblx0XHRcdCdteURlcml2ZWQuY29tcHV0ZWQgc3RhcnQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0J215RGVyaXZlZC5jb21wdXRlZCBlbmQnLFxuXHRcdFx0J3JlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlLCBteURlcml2ZWQ6IDEnLFxuXHRcdF0pO1xuXG5cdFx0bXlEZXJpdmVkLmdldCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW10pKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0c3VpdGUoJ3ByZXZlbnQgaW52YWxpZCB1c2FnZScsICgpID0+IHtcblx0XHRzdWl0ZSgncmVhZGluZyBvdXRzaWRlIG9mIGNvbXB1dGUgZnVuY3Rpb24nLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdkZXJpdmVkJywgKCkgPT4ge1xuXHRcdFx0XHRsZXQgZm46ICgpID0+IHZvaWQgPSAoKSA9PiB7IH07XG5cblx0XHRcdFx0Y29uc3Qgb2JzID0gb2JzZXJ2YWJsZVZhbHVlKCdvYnMnLCAwKTtcblx0XHRcdFx0Y29uc3QgZCA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0XHRmbiA9ICgpID0+IHsgb2JzLnJlYWQocmVhZGVyKTsgfTtcblx0XHRcdFx0XHRyZXR1cm4gb2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgZGlzcCA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRkLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0Zm4oKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0ZGlzcC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnYXV0b3J1bicsICgpID0+IHtcblx0XHRcdFx0bGV0IGZuOiAoKSA9PiB2b2lkID0gKCkgPT4geyB9O1xuXG5cdFx0XHRcdGNvbnN0IG9icyA9IG9ic2VydmFibGVWYWx1ZSgnb2JzJywgMCk7XG5cdFx0XHRcdGNvbnN0IGRpc3AgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0Zm4gPSAoKSA9PiB7IG9icy5yZWFkKHJlYWRlcik7IH07XG5cdFx0XHRcdFx0b2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0Zm4oKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0ZGlzcC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3Quc2tpcCgnY2F0Y2hlcyBjeWNsaWMgZGVwZW5kZW5jaWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXG5cdFx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKChlKSA9PiB7XG5cdFx0XHRcdGxvZy5sb2coZS50b1N0cmluZygpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBvYnMgPSBvYnNlcnZhYmxlVmFsdWUoJ29icycsIDApO1xuXHRcdFx0Y29uc3QgZDEgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdGxvZy5sb2coJ2QxLmNvbXB1dGVkIHN0YXJ0Jyk7XG5cdFx0XHRcdGNvbnN0IHggPSBvYnMucmVhZChyZWFkZXIpICsgZDIucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRsb2cubG9nKCdkMS5jb21wdXRlZCBlbmQnKTtcblx0XHRcdFx0cmV0dXJuIHg7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGQyID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRsb2cubG9nKCdkMi5jb21wdXRlZCBzdGFydCcpO1xuXHRcdFx0XHRkMS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGxvZy5sb2coJ2QyLmNvbXB1dGVkIGVuZCcpO1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBkaXNwID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRsb2cubG9nKCdhdXRvcnVuIHN0YXJ0Jyk7XG5cdFx0XHRcdGQxLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0bG9nLmxvZygnYXV0b3J1biBlbmQnKTtcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXG5cdFx0XHRcdCdhdXRvcnVuIHN0YXJ0Jyxcblx0XHRcdFx0J2QxLmNvbXB1dGVkIHN0YXJ0Jyxcblx0XHRcdFx0J2QyLmNvbXB1dGVkIHN0YXJ0Jyxcblx0XHRcdFx0J0Vycm9yOiBDeWNsaWMgZGVyaXZlZHMgYXJlIG5vdCBzdXBwb3J0ZWQgeWV0IScsXG5cdFx0XHRcdCdkMS5jb21wdXRlZCBlbmQnLFxuXHRcdFx0XHQnYXV0b3J1biBlbmQnXG5cdFx0XHRdKSk7XG5cblx0XHRcdGRpc3AuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnb2JzZXJ2YWJsZVJlZHVjZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnbWFpbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXG5cdFx0XHRjb25zdCBteU9ic2VydmFibGUxID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlciwgbnVtYmVyPignbXlPYnNlcnZhYmxlMScsIDUpO1xuXHRcdFx0Y29uc3QgbXlPYnNlcnZhYmxlMiA9IG9ic2VydmFibGVWYWx1ZTxudW1iZXIsIG51bWJlcj4oJ215T2JzZXJ2YWJsZTInLCA5KTtcblxuXHRcdFx0Y29uc3Qgc3VtID0gb2JzZXJ2YWJsZVJlZHVjZXIodGhpcywge1xuXHRcdFx0XHRpbml0aWFsOiAoKSA9PiB7XG5cdFx0XHRcdFx0bG9nLmxvZygnY3JlYXRlSW5pdGlhbCcpO1xuXHRcdFx0XHRcdHJldHVybiBteU9ic2VydmFibGUxLmdldCgpICsgbXlPYnNlcnZhYmxlMi5nZXQoKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzcG9zZUZpbmFsOiAodmFsdWVzKSA9PiB7XG5cdFx0XHRcdFx0bG9nLmxvZyhgZGlzcG9zZUZpbmFsICR7dmFsdWVzfWApO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjaGFuZ2VUcmFja2VyOiByZWNvcmRDaGFuZ2VzKHsgbXlPYnNlcnZhYmxlMSwgbXlPYnNlcnZhYmxlMiB9KSxcblx0XHRcdFx0dXBkYXRlOiAocmVhZGVyOiBJRGVyaXZlZFJlYWRlcjxudW1iZXI+LCBwcmV2aW91c1ZhbHVlLCBjaGFuZ2VzKSA9PiB7XG5cdFx0XHRcdFx0bG9nLmxvZyhgdXBkYXRlICR7SlNPTi5zdHJpbmdpZnkoY2hhbmdlcyl9YCk7XG5cdFx0XHRcdFx0bGV0IGRlbHRhID0gMDtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBjaGFuZ2VzLmNoYW5nZXMpIHtcblx0XHRcdFx0XHRcdGRlbHRhICs9IGNoYW5nZS5jaGFuZ2U7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmVhZGVyLnJlcG9ydENoYW5nZShkZWx0YSk7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0VmFsdWUgPSBwcmV2aW91c1ZhbHVlICsgZGVsdGE7XG5cdFx0XHRcdFx0bG9nLmxvZyhgdXBkYXRlIC0+ICR7cmVzdWx0VmFsdWV9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdFZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXSkpO1xuXG5cdFx0XHRzdG9yZS5hZGQoYXV0b3J1bldpdGhTdG9yZUhhbmRsZUNoYW5nZXMoe1xuXHRcdFx0XHRjaGFuZ2VUcmFja2VyOiByZWNvcmRDaGFuZ2VzKHsgc3VtIH0pXG5cdFx0XHR9LCAoX3JlYWRlciwgY2hhbmdlcykgPT4ge1xuXHRcdFx0XHRsb2cubG9nKGBhdXRvcnVuICR7SlNPTi5zdHJpbmdpZnkoY2hhbmdlcyl9YCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdjcmVhdGVJbml0aWFsJyxcblx0XHRcdFx0J3VwZGF0ZSB7XCJjaGFuZ2VzXCI6W10sXCJteU9ic2VydmFibGUxXCI6NSxcIm15T2JzZXJ2YWJsZTJcIjo5fScsXG5cdFx0XHRcdCd1cGRhdGUgLT4gMTQnLFxuXHRcdFx0XHQnYXV0b3J1biB7XCJjaGFuZ2VzXCI6W10sXCJzdW1cIjoxNH0nLFxuXHRcdFx0XSk7XG5cblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0bXlPYnNlcnZhYmxlMS5zZXQobXlPYnNlcnZhYmxlMS5nZXQoKSArIDEsIHR4LCAxKTtcblx0XHRcdFx0bXlPYnNlcnZhYmxlMi5zZXQobXlPYnNlcnZhYmxlMi5nZXQoKSArIDMsIHR4LCAzKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtcblx0XHRcdFx0J3VwZGF0ZSB7XCJjaGFuZ2VzXCI6W3tcImtleVwiOlwibXlPYnNlcnZhYmxlMVwiLFwiY2hhbmdlXCI6MX0se1wia2V5XCI6XCJteU9ic2VydmFibGUyXCIsXCJjaGFuZ2VcIjozfV0sXCJteU9ic2VydmFibGUxXCI6NixcIm15T2JzZXJ2YWJsZTJcIjoxMn0nLFxuXHRcdFx0XHQndXBkYXRlIC0+IDE4Jyxcblx0XHRcdFx0J2F1dG9ydW4ge1wiY2hhbmdlc1wiOlt7XCJrZXlcIjpcInN1bVwiLFwiY2hhbmdlXCI6NH1dLFwic3VtXCI6MTh9J1xuXHRcdFx0XSkpO1xuXG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdG15T2JzZXJ2YWJsZTEuc2V0KG15T2JzZXJ2YWJsZTEuZ2V0KCkgKyAxLCB0eCwgMSk7XG5cdFx0XHRcdGNvbnN0IHMgPSBzdW0uZ2V0KCk7XG5cdFx0XHRcdGxvZy5sb2coYHN1bS5nZXQoKSAke3N9YCk7XG5cdFx0XHRcdG15T2JzZXJ2YWJsZTIuc2V0KG15T2JzZXJ2YWJsZTIuZ2V0KCkgKyAzLCB0eCwgMyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXG5cdFx0XHRcdCd1cGRhdGUge1wiY2hhbmdlc1wiOlt7XCJrZXlcIjpcIm15T2JzZXJ2YWJsZTFcIixcImNoYW5nZVwiOjF9XSxcIm15T2JzZXJ2YWJsZTFcIjo3LFwibXlPYnNlcnZhYmxlMlwiOjEyfScsXG5cdFx0XHRcdCd1cGRhdGUgLT4gMTknLFxuXHRcdFx0XHQnc3VtLmdldCgpIDE5Jyxcblx0XHRcdFx0J3VwZGF0ZSB7XCJjaGFuZ2VzXCI6W3tcImtleVwiOlwibXlPYnNlcnZhYmxlMlwiLFwiY2hhbmdlXCI6M31dLFwibXlPYnNlcnZhYmxlMVwiOjcsXCJteU9ic2VydmFibGUyXCI6MTV9Jyxcblx0XHRcdFx0J3VwZGF0ZSAtPiAyMicsXG5cdFx0XHRcdCdhdXRvcnVuIHtcImNoYW5nZXNcIjpbe1wia2V5XCI6XCJzdW1cIixcImNoYW5nZVwiOjF9XSxcInN1bVwiOjIyfSdcblx0XHRcdF0pKTtcblxuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtcblx0XHRcdFx0J2Rpc3Bvc2VGaW5hbCAyMidcblx0XHRcdF0pKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Rpc3Bvc2FibGVTdG9yZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZGVyaXZlZCB3aXRoIHN0b3JlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2YWJsZTEgPSBvYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZVZhbHVlMScsIDApO1xuXG5cdFx0XHRjb25zdCBjb21wdXRlZDEgPSBkZXJpdmVkKChyZWFkZXIpID0+IHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBvYnNlcnZhYmxlMS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGxvZy5sb2coYGNvbXB1dGVkICR7dmFsdWV9YCk7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRsb2cubG9nKGBjb21wdXRlZDE6ICR7dmFsdWV9IGRpc3Bvc2VkYCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGEgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGxvZy5sb2coYGE6ICR7Y29tcHV0ZWQxLnJlYWQocmVhZGVyKX1gKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtcblx0XHRcdFx0J2NvbXB1dGVkIDAnLFxuXHRcdFx0XHQnYTogMCdcblx0XHRcdF0pKTtcblxuXHRcdFx0b2JzZXJ2YWJsZTEuc2V0KDEsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0XHQnY29tcHV0ZWQxOiAwIGRpc3Bvc2VkJyxcblx0XHRcdFx0J2NvbXB1dGVkIDEnLFxuXHRcdFx0XHQnYTogMSdcblx0XHRcdF0pKTtcblxuXHRcdFx0YS5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0XHQnY29tcHV0ZWQxOiAxIGRpc3Bvc2VkJ1xuXHRcdFx0XSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVyaXZlZCB3aXRoIGRlbGF5ZWRTdG9yZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRcdGNvbnN0IG9ic2VydmFibGUxID0gb2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGVWYWx1ZTEnLCAwKTtcblxuXHRcdFx0Y29uc3QgY29tcHV0ZWQxID0gZGVyaXZlZCgocmVhZGVyKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gb2JzZXJ2YWJsZTEucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRsb2cubG9nKGBjb21wdXRlZCAke3ZhbHVlfWApO1xuXHRcdFx0XHRyZWFkZXIuZGVsYXllZFN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRcdGxvZy5sb2coYGNvbXB1dGVkMTogJHt2YWx1ZX0gZGlzcG9zZWRgKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYSA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0bG9nLmxvZyhgYTogJHtjb21wdXRlZDEucmVhZChyZWFkZXIpfWApO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0XHQnY29tcHV0ZWQgMCcsXG5cdFx0XHRcdCdhOiAwJ1xuXHRcdFx0XSkpO1xuXG5cdFx0XHRvYnNlcnZhYmxlMS5zZXQoMSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXG5cdFx0XHRcdCdjb21wdXRlZCAxJyxcblx0XHRcdFx0J2NvbXB1dGVkMTogMCBkaXNwb3NlZCcsXG5cdFx0XHRcdCdhOiAxJ1xuXHRcdFx0XSkpO1xuXG5cdFx0XHRhLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXG5cdFx0XHRcdCdjb21wdXRlZDE6IDEgZGlzcG9zZWQnXG5cdFx0XHRdKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlcml2ZWRIYW5kbGVDaGFuZ2VzIHdpdGggcmVwb3J0Q2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cblx0XHRjb25zdCBzaWduYWwxID0gb2JzZXJ2YWJsZVNpZ25hbDx7IG1lc3NhZ2U6IHN0cmluZyB9Pignc2lnbmFsMScpO1xuXHRcdGNvbnN0IHNpZ25hbDIgPSBvYnNlcnZhYmxlU2lnbmFsPHsgbWVzc2FnZTogc3RyaW5nIH0+KCdzaWduYWwyJyk7XG5cblx0XHRjb25zdCBzaWduYWwyRGVyaXZlZCA9IGRlcml2ZWRIYW5kbGVDaGFuZ2VzKFxuXHRcdFx0eyBjaGFuZ2VUcmFja2VyOiByZWNvcmRDaGFuZ2VzKHsgc2lnbmFsMiB9KSB9LFxuXHRcdFx0KHJlYWRlcjogSURlcml2ZWRSZWFkZXI8eyBtZXNzYWdlOiBzdHJpbmcgfT4sIGNoYW5nZVN1bW1hcnkpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBjIG9mIGNoYW5nZVN1bW1hcnkuY2hhbmdlcykge1xuXHRcdFx0XHRcdHJlYWRlci5yZXBvcnRDaGFuZ2UoeyBtZXNzYWdlOiBjLmNoYW5nZS5tZXNzYWdlICsgJyAoZGVyaXZlZCknIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IGQgPSBkZXJpdmVkSGFuZGxlQ2hhbmdlcyh7XG5cdFx0XHRjaGFuZ2VUcmFja2VyOiByZWNvcmRDaGFuZ2VzKHsgc2lnbmFsMSwgc2lnbmFsMkRlcml2ZWQgfSksXG5cdFx0fSwgKHI6IElEZXJpdmVkUmVhZGVyPHN0cmluZz4sIGNoYW5nZXMpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IGNoYW5nZXMuY2hhbmdlcy5tYXAoYyA9PiBgJHtjLmtleX06ICR7Yy5jaGFuZ2UubWVzc2FnZX1gKS5qb2luKCcsICcpO1xuXHRcdFx0ci5yZXBvcnRDaGFuZ2UobG9nKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpc3AgPSBydW5PbkNoYW5nZShkLCAoX3ZhbCwgX3ByZXYsIGNoYW5nZXMpID0+IHtcblx0XHRcdGxvZy5sb2coYHJ1bk9uQ2hhbmdlICR7SlNPTi5zdHJpbmdpZnkoY2hhbmdlcyl9YCk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtdKSk7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRzaWduYWwxLnRyaWdnZXIodHgsIHsgbWVzc2FnZTogJ2ZvbycgfSk7XG5cdFx0XHRzaWduYWwyLnRyaWdnZXIodHgsIHsgbWVzc2FnZTogJ2JhcicgfSk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtcblx0XHRcdCdydW5PbkNoYW5nZSBbXCJzaWduYWwxOiBmb28sIHNpZ25hbDJEZXJpdmVkOiBiYXIgKGRlcml2ZWQpXCJdJ1xuXHRcdF0pKTtcblxuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0c2lnbmFsMi50cmlnZ2VyKHR4LCB7IG1lc3NhZ2U6ICdiYXonIH0pO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXG5cdFx0XHQncnVuT25DaGFuZ2UgW1wic2lnbmFsMkRlcml2ZWQ6IGJheiAoZGVyaXZlZClcIl0nXG5cdFx0XSkpO1xuXG5cdFx0ZGlzcC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhdXRvcnVuUGVyS2V5ZWRJdGVtJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3J1bnMgc2V0dXAgb25jZSBwZXIga2V5LCBmaXJlcyBwZXIta2V5IG9ic2VydmFibGUgb24gaW4tcGxhY2UgdmFsdWUgY2hhbmdlLCBkaXNwb3NlcyBvbiByZW1vdmFsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgeyBpZDogc3RyaW5nOyB2OiBudW1iZXIgfVtdPignaXRlbXMnLCBbXSk7XG5cblx0XHRcdGNvbnN0IGQgPSBkcy5hZGQoYXV0b3J1blBlcktleWVkSXRlbShcblx0XHRcdFx0aXRlbXMsXG5cdFx0XHRcdGl0ID0+IGl0LmlkLFxuXHRcdFx0XHQoa2V5LCB2YWx1ZSwgc3RvcmUpID0+IHtcblx0XHRcdFx0XHRsb2cubG9nKGBzZXR1cCgke2tleX0pYCk7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBsb2cubG9nKGBkaXNwb3NlKCR7a2V5fSlgKSkpO1xuXHRcdFx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB2ID0gdmFsdWUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdFx0bG9nLmxvZyhgYXV0b3J1bigke2tleX0pOiB2PSR7di52fWApO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXG5cdFx0XHRpdGVtcy5zZXQoW3sgaWQ6ICdhJywgdjogMSB9LCB7IGlkOiAnYicsIHY6IDEgfV0sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnc2V0dXAoYSknLFxuXHRcdFx0XHQnYXV0b3J1bihhKTogdj0xJyxcblx0XHRcdFx0J3NldHVwKGIpJyxcblx0XHRcdFx0J2F1dG9ydW4oYik6IHY9MScsXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gSW4tcGxhY2UgdmFsdWUgY2hhbmdlIG9uIGBhYCAoc2FtZSBrZXksIG5ldyBpbW11dGFibGUgb2JqZWN0KSBcdTIxOTIgaXRzXG5cdFx0XHQvLyBwZXIta2V5IG9ic2VydmFibGUgZmlyZXMuIGBiYCBpcyBhbHNvIGEgbmV3IG9iamVjdCBsaXRlcmFsIGhlcmUsIHNvXG5cdFx0XHQvLyBpdHMgb2JzZXJ2YWJsZSBmaXJlcyB0b286IGlkZW50aXR5IGNvbXBhcmlzb24sIG5vdCBkZWVwLWVxdWFsaXR5LlxuXHRcdFx0aXRlbXMuc2V0KFt7IGlkOiAnYScsIHY6IDIgfSwgeyBpZDogJ2InLCB2OiAxIH1dLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J2F1dG9ydW4oYSk6IHY9MicsXG5cdFx0XHRcdCdhdXRvcnVuKGIpOiB2PTEnLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIFJlbW92ZSBgYWA6IGl0cyBzdG9yZSBpcyBkaXNwb3NlZDsgYGJgIHN1cnZpdmVzIChpdHMgb2JzZXJ2YWJsZVxuXHRcdFx0Ly8gYWxzbyBmaXJlcyBiZWNhdXNlIHRoZSBuZXcgYXJyYXkgY29udGFpbnMgYSBmcmVzaCBvYmplY3QgbGl0ZXJhbFxuXHRcdFx0Ly8gZm9yIGBiYCkuXG5cdFx0XHRpdGVtcy5zZXQoW3sgaWQ6ICdiJywgdjogMSB9XSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdkaXNwb3NlKGEpJyxcblx0XHRcdFx0J2F1dG9ydW4oYik6IHY9MScsXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gQWRkIGBhYCBiYWNrOiBzZXR1cCBydW5zIGFnYWluIGZyb20gc2NyYXRjaC4gYGJgIGZpcmVzIG9uY2UgbW9yZVxuXHRcdFx0Ly8gYmVjYXVzZSB0aGUgbmV3IGFycmF5IGxpdGVyYWwgY29udGFpbnMgYSBmcmVzaCBgYmAgb2JqZWN0LlxuXHRcdFx0aXRlbXMuc2V0KFt7IGlkOiAnYicsIHY6IDEgfSwgeyBpZDogJ2EnLCB2OiA5IH1dLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J2F1dG9ydW4oYik6IHY9MScsXG5cdFx0XHRcdCdzZXR1cChhKScsXG5cdFx0XHRcdCdhdXRvcnVuKGEpOiB2PTknLFxuXHRcdFx0XSk7XG5cblx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdFx0Ly8gRGlzcG9zaW5nIHRoZSBhdXRvcnVuIGRpc3Bvc2VzIGFsbCByZW1haW5pbmcgcGVyLWtleSBzdG9yZXMuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKS5zb3J0KCksIFtcblx0XHRcdFx0J2Rpc3Bvc2UoYSknLFxuXHRcdFx0XHQnZGlzcG9zZShiKScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JhdGNoZXMgcGVyLWtleSB2YWx1ZSB1cGRhdGVzIGF0b21pY2FsbHkgYWNyb3NzIG9uZSBpdGVtcyBjaGFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSB7IGlkOiBzdHJpbmc7IHY6IG51bWJlciB9W10+KCdpdGVtcycsIFtcblx0XHRcdFx0eyBpZDogJ2EnLCB2OiAwIH0sXG5cdFx0XHRcdHsgaWQ6ICdiJywgdjogMCB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGRzLmFkZChhdXRvcnVuUGVyS2V5ZWRJdGVtKFxuXHRcdFx0XHRpdGVtcyxcblx0XHRcdFx0aXQgPT4gaXQuaWQsXG5cdFx0XHRcdChrZXksIHZhbHVlLCBzdG9yZSkgPT4ge1xuXHRcdFx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0XHRsb2cubG9nKGAke2tleX09JHt2YWx1ZS5yZWFkKHJlYWRlcikudn1gKTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnYT0wJywgJ2I9MCddKTtcblxuXHRcdFx0Ly8gU2luZ2xlIHVwc3RyZWFtIGNoYW5nZSB1cGRhdGVzIGJvdGgga2V5czsgcGVyLWtleSBhdXRvcnVucyBlYWNoIGZpcmVcblx0XHRcdC8vIG9uY2Ugd2l0aCB0aGUgcG9zdC1jaGFuZ2UgdmFsdWVzLlxuXHRcdFx0aXRlbXMuc2V0KFt7IGlkOiAnYScsIHY6IDEgfSwgeyBpZDogJ2InLCB2OiAyIH1dLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnYT0xJywgJ2I9MiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGZpcmUgcGVyLWtleSBvYnNlcnZhYmxlIHdoZW4gc2FtZSBpdGVtIGlkZW50aXR5IGlzIHJldXNlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRcdGNvbnN0IGEgPSB7IGlkOiAnYScsIHY6IDEgfTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IHsgaWQ6IHN0cmluZzsgdjogbnVtYmVyIH1bXT4oJ2l0ZW1zJywgW2FdKTtcblxuXHRcdFx0ZHMuYWRkKGF1dG9ydW5QZXJLZXllZEl0ZW0oXG5cdFx0XHRcdGl0ZW1zLFxuXHRcdFx0XHRpdCA9PiBpdC5pZCxcblx0XHRcdFx0KF9rZXksIHZhbHVlLCBzdG9yZSkgPT4ge1xuXHRcdFx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiBsb2cubG9nKGB2PSR7dmFsdWUucmVhZChyZWFkZXIpLnZ9YCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgWyd2PTEnXSk7XG5cblx0XHRcdC8vIFNhbWUgYXJyYXkgc2hhcGUsIHNhbWUgaXRlbSBpZGVudGl0eSBcdTIxOTIgbm8gdmFsdWUgY2hhbmdlLCBubyBhdXRvcnVuIGZpcmUuXG5cdFx0XHRpdGVtcy5zZXQoW2FdLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Blci1rZXkgc2V0dXAgZmlyZXMgd2hlbiBpdGVtcyBkZXJpdmVkIHRocm91Z2ggb2JzZXJ2YWJsZUZyb21FdmVudCBjaGFpbiB1cGRhdGVzJywgKCkgPT4ge1xuXHRcdFx0Ly8gTWlycm9ycyBob3cgYWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIgdXNlcyBvYnNlcnZhYmxlRnJvbUV2ZW50IFx1MjE5MlxuXHRcdFx0Ly8gZGVyaXZlZChhY3RpdmVUdXJuKSBcdTIxOTIgZGVyaXZlZChyZXNwb25zZVBhcnRzKSBcdTIxOTIgYXV0b3J1blBlcktleWVkSXRlbS5cblx0XHRcdC8vIFZlcmlmaWVzIHRoYXQgaW5jcmVtZW50YWwgdXBzdHJlYW0gRXZlbnQgZmlyZXMgcHJvcGFnYXRlIHRocm91Z2hcblx0XHRcdC8vIHRoZSBjaGFpbiBhbmQgdGhlIHBlci1rZXkgc2V0dXAgb2JzZXJ2ZXMgdGhlIG5ldyBpdGVtcy5cblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRcdGludGVyZmFjZSBQYXJ0IHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkgY29udGVudDogc3RyaW5nIH1cblx0XHRcdGludGVyZmFjZSBTdGF0ZSB7IHJlYWRvbmx5IGFjdGl2ZT86IHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkgcGFydHM6IHJlYWRvbmx5IFBhcnRbXSB9IH1cblxuXHRcdFx0bGV0IGN1cnJlbnQ6IFN0YXRlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgb25DaGFuZ2UgPSBkcy5hZGQobmV3IEVtaXR0ZXI8U3RhdGU+KCkpO1xuXHRcdFx0Y29uc3QgZmFrZVN1YiA9IHsgdmFsdWU6IHVuZGVmaW5lZCBhcyBTdGF0ZSB8IHVuZGVmaW5lZCwgb25EaWRDaGFuZ2U6IG9uQ2hhbmdlLmV2ZW50IH07XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RhdGUkID0gb2JzZXJ2YWJsZUZyb21FdmVudCh1bmRlZmluZWQsIGZha2VTdWIub25EaWRDaGFuZ2UsICgpID0+IGZha2VTdWIudmFsdWUpO1xuXHRcdFx0Y29uc3QgZmlyZSA9IChzOiBTdGF0ZSkgPT4geyBjdXJyZW50ID0gczsgZmFrZVN1Yi52YWx1ZSA9IHM7IG9uQ2hhbmdlLmZpcmUocyk7IH07XG5cblx0XHRcdGNvbnN0IHR1cm4kID0gZGVyaXZlZChyZWFkZXIgPT4gc2Vzc2lvblN0YXRlJC5yZWFkKHJlYWRlcik/LmFjdGl2ZSk7XG5cdFx0XHRjb25zdCBwYXJ0cyQgPSBkZXJpdmVkKHJlYWRlciA9PiB0dXJuJC5yZWFkKHJlYWRlcik/LnBhcnRzID8/IFtdKTtcblxuXHRcdFx0ZHMuYWRkKGF1dG9ydW5QZXJLZXllZEl0ZW0oXG5cdFx0XHRcdHBhcnRzJCxcblx0XHRcdFx0cCA9PiBwLmlkLFxuXHRcdFx0XHQoa2V5LCBwJCwgc3RvcmUpID0+IHtcblx0XHRcdFx0XHRsb2cubG9nKGBzZXR1cCgke2tleX0pYCk7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IGxvZy5sb2coYCR7a2V5fT0ke3AkLnJlYWQocmVhZGVyKS5jb250ZW50Lmxlbmd0aH1gKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHQpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cblx0XHRcdC8vIEZpcnN0IHN0YXRlIHdpdGggb25lIHBhcnQgXHUyMDE0IHNhbWUgc2hhcGUgYXMgYSB0dXJuIHN0YXJ0aW5nIHdpdGggY29udGVudC5cblx0XHRcdGZpcmUoeyBhY3RpdmU6IHsgaWQ6ICd0MScsIHBhcnRzOiBbeyBpZDogJ3AxJywgY29udGVudDogJ2hlbGxvJyB9XSB9IH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnc2V0dXAocDEpJywgJ3AxPTUnXSk7XG5cblx0XHRcdC8vIEFwcGVuZCBtb3JlIGNvbnRlbnQgdG8gcDEuXG5cdFx0XHRmaXJlKHsgYWN0aXZlOiB7IGlkOiAndDEnLCBwYXJ0czogW3sgaWQ6ICdwMScsIGNvbnRlbnQ6ICdoZWxsbyB3b3JsZCcgfV0gfSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbJ3AxPTExJ10pO1xuXG5cdFx0XHQvLyBBZGQgYSBuZXcgcGFydCBwMi4gcDEgYWxzbyBmaXJlcyBiZWNhdXNlIHRoZSBuZXcgYXJyYXkgbGl0ZXJhbFxuXHRcdFx0Ly8gYWxsb2NhdGVzIGEgZnJlc2ggb2JqZWN0IGZvciBpdCAoaWRlbnRpdHkgZGlmZmVycyBldmVuIHRob3VnaFxuXHRcdFx0Ly8gY29udGVudCBpcyB0aGUgc2FtZSkuXG5cdFx0XHRmaXJlKHsgYWN0aXZlOiB7IGlkOiAndDEnLCBwYXJ0czogW3sgaWQ6ICdwMScsIGNvbnRlbnQ6ICdoZWxsbyB3b3JsZCcgfSwgeyBpZDogJ3AyJywgY29udGVudDogJ3JlYXNvbmluZycgfV0gfSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbJ3AxPTExJywgJ3NldHVwKHAyKScsICdwMj05J10pO1xuXHRcdFx0dm9pZCBjdXJyZW50O1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5leHBvcnQgY2xhc3MgTG9nZ2luZ09ic2VydmVyIGltcGxlbWVudHMgSU9ic2VydmVyIHtcblx0cHJpdmF0ZSBjb3VudCA9IDA7XG5cblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGRlYnVnTmFtZTogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IGxvZzogTG9nKSB7XG5cdH1cblxuXHRiZWdpblVwZGF0ZTxUPihvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IHZvaWQge1xuXHRcdHRoaXMuY291bnQrKztcblx0XHR0aGlzLmxvZy5sb2coYCR7dGhpcy5kZWJ1Z05hbWV9LmJlZ2luVXBkYXRlIChjb3VudCAke3RoaXMuY291bnR9KWApO1xuXHR9XG5cdGVuZFVwZGF0ZTxUPihvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IHZvaWQge1xuXHRcdHRoaXMubG9nLmxvZyhgJHt0aGlzLmRlYnVnTmFtZX0uZW5kVXBkYXRlIChjb3VudCAke3RoaXMuY291bnR9KWApO1xuXHRcdHRoaXMuY291bnQtLTtcblx0fVxuXHRoYW5kbGVDaGFuZ2U8VCwgVENoYW5nZT4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGVXaXRoQ2hhbmdlPFQsIFRDaGFuZ2U+LCBjaGFuZ2U6IFRDaGFuZ2UpOiB2b2lkIHtcblx0XHR0aGlzLmxvZy5sb2coYCR7dGhpcy5kZWJ1Z05hbWV9LmhhbmRsZUNoYW5nZSAoY291bnQgJHt0aGlzLmNvdW50fSlgKTtcblx0fVxuXHRoYW5kbGVQb3NzaWJsZUNoYW5nZTxUPihvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IHZvaWQge1xuXHRcdHRoaXMubG9nLmxvZyhgJHt0aGlzLmRlYnVnTmFtZX0uaGFuZGxlUG9zc2libGVDaGFuZ2VgKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTG9nZ2luZ09ic2VydmFibGVWYWx1ZTxULCBUQ2hhbmdlID0gdm9pZD5cblx0ZXh0ZW5kcyBCYXNlT2JzZXJ2YWJsZTxULCBUQ2hhbmdlPlxuXHRpbXBsZW1lbnRzIElTZXR0YWJsZU9ic2VydmFibGU8VCwgVENoYW5nZT4ge1xuXHRwcml2YXRlIHZhbHVlOiBUO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBkZWJ1Z05hbWU6IHN0cmluZyxcblx0XHRpbml0aWFsVmFsdWU6IFQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dnZXI6IExvZ1xuXHQpIHtcblx0XHRzdXBlcihEZWJ1Z0xvY2F0aW9uLm9mQ2FsbGVyKCkpO1xuXHRcdHRoaXMudmFsdWUgPSBpbml0aWFsVmFsdWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25GaXJzdE9ic2VydmVyQWRkZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIubG9nKGAke3RoaXMuZGVidWdOYW1lfS5maXJzdE9ic2VydmVyQWRkZWRgKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbkxhc3RPYnNlcnZlclJlbW92ZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXIubG9nKGAke3RoaXMuZGVidWdOYW1lfS5sYXN0T2JzZXJ2ZXJSZW1vdmVkYCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0KCk6IFQge1xuXHRcdHRoaXMubG9nZ2VyLmxvZyhgJHt0aGlzLmRlYnVnTmFtZX0uZ2V0YCk7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgc2V0KHZhbHVlOiBULCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkLCBjaGFuZ2U6IFRDaGFuZ2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy52YWx1ZSA9PT0gdmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXR4KSB7XG5cdFx0XHR0cmFuc2FjdGlvbigodHgpID0+IHtcblx0XHRcdFx0dGhpcy5zZXQodmFsdWUsIHR4LCBjaGFuZ2UpO1xuXHRcdFx0fSwgKCkgPT4gYFNldHRpbmcgJHt0aGlzLmRlYnVnTmFtZX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ2dlci5sb2coYCR7dGhpcy5kZWJ1Z05hbWV9LnNldCAodmFsdWUgJHt2YWx1ZX0pYCk7XG5cblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cblx0XHRmb3IgKGNvbnN0IG9ic2VydmVyIG9mIHRoaXMuX29ic2VydmVycykge1xuXHRcdFx0dHgudXBkYXRlT2JzZXJ2ZXIob2JzZXJ2ZXIsIHRoaXMpO1xuXHRcdFx0b2JzZXJ2ZXIuaGFuZGxlQ2hhbmdlKHRoaXMsIGNoYW5nZSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5kZWJ1Z05hbWV9OiAke3RoaXMudmFsdWV9YDtcblx0fVxufVxuXG5jbGFzcyBMb2cge1xuXHRwcml2YXRlIHJlYWRvbmx5IGVudHJpZXM6IHN0cmluZ1tdID0gW107XG5cdHB1YmxpYyBsb2cobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5lbnRyaWVzLnB1c2gobWVzc2FnZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QW5kQ2xlYXJFbnRyaWVzKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBlbnRyaWVzID0gWy4uLnRoaXMuZW50cmllc107XG5cdFx0dGhpcy5lbnRyaWVzLmxlbmd0aCA9IDA7XG5cdFx0cmV0dXJuIGVudHJpZXM7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FB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
