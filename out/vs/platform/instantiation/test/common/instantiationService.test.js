var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import assert from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { SyncDescriptor } from "../../common/descriptors.js";
import { createDecorator, IInstantiationService } from "../../common/instantiation.js";
import { InstantiationService } from "../../common/instantiationService.js";
import { ServiceCollection } from "../../common/serviceCollection.js";
const IService1 = createDecorator("service1");
class Service1 {
  constructor() {
    this.c = 1;
  }
}
const IService2 = createDecorator("service2");
class Service2 {
  constructor() {
    this.d = true;
  }
}
const IService3 = createDecorator("service3");
class Service3 {
  constructor() {
    this.s = "farboo";
  }
}
const IDependentService = createDecorator("dependentService");
let DependentService = class {
  constructor(service) {
    this.name = "farboo";
    assert.strictEqual(service.c, 1);
  }
};
DependentService = __decorateClass([
  __decorateParam(0, IService1)
], DependentService);
let Service1Consumer = class {
  constructor(service1) {
    assert.ok(service1);
    assert.strictEqual(service1.c, 1);
  }
};
Service1Consumer = __decorateClass([
  __decorateParam(0, IService1)
], Service1Consumer);
let Target2Dep = class {
  constructor(service1, service2) {
    assert.ok(service1 instanceof Service1);
    assert.ok(service2 instanceof Service2);
  }
};
Target2Dep = __decorateClass([
  __decorateParam(0, IService1),
  __decorateParam(1, IService2)
], Target2Dep);
let TargetWithStaticParam = class {
  constructor(v, service1) {
    assert.ok(v);
    assert.ok(service1);
    assert.strictEqual(service1.c, 1);
  }
};
TargetWithStaticParam = __decorateClass([
  __decorateParam(1, IService1)
], TargetWithStaticParam);
let DependentServiceTarget = class {
  constructor(d) {
    assert.ok(d);
    assert.strictEqual(d.name, "farboo");
  }
};
DependentServiceTarget = __decorateClass([
  __decorateParam(0, IDependentService)
], DependentServiceTarget);
let DependentServiceTarget2 = class {
  constructor(d, s) {
    assert.ok(d);
    assert.strictEqual(d.name, "farboo");
    assert.ok(s);
    assert.strictEqual(s.c, 1);
  }
};
DependentServiceTarget2 = __decorateClass([
  __decorateParam(0, IDependentService),
  __decorateParam(1, IService1)
], DependentServiceTarget2);
let ServiceLoop1 = class {
  constructor(s) {
    this.c = 1;
  }
};
ServiceLoop1 = __decorateClass([
  __decorateParam(0, IService2)
], ServiceLoop1);
let ServiceLoop2 = class {
  constructor(s) {
    this.d = true;
  }
};
ServiceLoop2 = __decorateClass([
  __decorateParam(0, IService1)
], ServiceLoop2);
suite("Instantiation Service", () => {
  test("service collection, cannot overwrite", function() {
    const collection = new ServiceCollection();
    let result = collection.set(IService1, null);
    assert.strictEqual(result, void 0);
    result = collection.set(IService1, new Service1());
    assert.strictEqual(result, null);
  });
  test("service collection, add/has", function() {
    const collection = new ServiceCollection();
    collection.set(IService1, null);
    assert.ok(collection.has(IService1));
    collection.set(IService2, null);
    assert.ok(collection.has(IService1));
    assert.ok(collection.has(IService2));
  });
  test("@Param - simple clase", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new Service1());
    collection.set(IService2, new Service2());
    collection.set(IService3, new Service3());
    service.createInstance(Service1Consumer);
  });
  test("@Param - fixed args", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new Service1());
    collection.set(IService2, new Service2());
    collection.set(IService3, new Service3());
    service.createInstance(TargetWithStaticParam, true);
  });
  test("service collection is live", function() {
    const collection = new ServiceCollection();
    collection.set(IService1, new Service1());
    const service = new InstantiationService(collection);
    service.createInstance(Service1Consumer);
    collection.set(IService2, new Service2());
    service.createInstance(Target2Dep);
    service.invokeFunction(function(a) {
      assert.ok(a.get(IService1));
      assert.ok(a.get(IService2));
    });
  });
  test("SyncDesc - no dependencies", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new SyncDescriptor(Service1));
    service.invokeFunction((accessor) => {
      const service1 = accessor.get(IService1);
      assert.ok(service1);
      assert.strictEqual(service1.c, 1);
      const service2 = accessor.get(IService1);
      assert.ok(service1 === service2);
    });
  });
  test("SyncDesc - service with service dependency", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new SyncDescriptor(Service1));
    collection.set(IDependentService, new SyncDescriptor(DependentService));
    service.invokeFunction((accessor) => {
      const d = accessor.get(IDependentService);
      assert.ok(d);
      assert.strictEqual(d.name, "farboo");
    });
  });
  test("SyncDesc - target depends on service future", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new SyncDescriptor(Service1));
    collection.set(IDependentService, new SyncDescriptor(DependentService));
    const d = service.createInstance(DependentServiceTarget);
    assert.ok(d instanceof DependentServiceTarget);
    const d2 = service.createInstance(DependentServiceTarget2);
    assert.ok(d2 instanceof DependentServiceTarget2);
  });
  test("SyncDesc - explode on loop", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new SyncDescriptor(ServiceLoop1));
    collection.set(IService2, new SyncDescriptor(ServiceLoop2));
    assert.throws(() => {
      service.invokeFunction((accessor) => {
        accessor.get(IService1);
      });
    });
    assert.throws(() => {
      service.invokeFunction((accessor) => {
        accessor.get(IService2);
      });
    });
    try {
      service.invokeFunction((accessor) => {
        accessor.get(IService1);
      });
    } catch (err) {
      assert.ok(err.name);
      assert.ok(err.message);
    }
  });
  test("Invoke - get services", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new Service1());
    collection.set(IService2, new Service2());
    function test2(accessor) {
      assert.ok(accessor.get(IService1) instanceof Service1);
      assert.strictEqual(accessor.get(IService1).c, 1);
      return true;
    }
    assert.strictEqual(service.invokeFunction(test2), true);
  });
  test("Invoke - get service, optional", function() {
    const collection = new ServiceCollection([IService1, new Service1()]);
    const service = new InstantiationService(collection, true);
    function test2(accessor) {
      assert.ok(accessor.get(IService1) instanceof Service1);
      assert.throws(() => accessor.get(IService2));
      return true;
    }
    assert.strictEqual(service.invokeFunction(test2), true);
  });
  test("Invoke - keeping accessor NOT allowed", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new Service1());
    collection.set(IService2, new Service2());
    let cached;
    function test2(accessor) {
      assert.ok(accessor.get(IService1) instanceof Service1);
      assert.strictEqual(accessor.get(IService1).c, 1);
      cached = accessor;
      return true;
    }
    assert.strictEqual(service.invokeFunction(test2), true);
    assert.throws(() => cached.get(IService2));
  });
  test("Invoke - throw error", function() {
    const collection = new ServiceCollection();
    const service = new InstantiationService(collection);
    collection.set(IService1, new Service1());
    collection.set(IService2, new Service2());
    function test2(accessor) {
      throw new Error();
    }
    assert.throws(() => service.invokeFunction(test2));
  });
  test("Create child", function() {
    let serviceInstanceCount = 0;
    const CtorCounter = class {
      constructor() {
        this.c = 1;
        serviceInstanceCount += 1;
      }
    };
    let service = new InstantiationService(new ServiceCollection([IService1, new SyncDescriptor(CtorCounter)]));
    service.createInstance(Service1Consumer);
    let child = service.createChild(new ServiceCollection([IService2, new Service2()]));
    child.createInstance(Service1Consumer);
    assert.strictEqual(serviceInstanceCount, 1);
    serviceInstanceCount = 0;
    service = new InstantiationService(new ServiceCollection([IService1, new SyncDescriptor(CtorCounter)]));
    child = service.createChild(new ServiceCollection([IService2, new Service2()]));
    service.createInstance(Service1Consumer);
    child.createInstance(Service1Consumer);
    assert.strictEqual(serviceInstanceCount, 1);
  });
  test("Remote window / integration tests is broken #105562", function() {
    const Service12 = createDecorator("service1");
    let Service1Impl = class {
      constructor(insta2) {
        const c = insta2.invokeFunction((accessor) => accessor.get(Service22));
        assert.ok(c);
      }
    };
    Service1Impl = __decorateClass([
      __decorateParam(0, IInstantiationService)
    ], Service1Impl);
    const Service22 = createDecorator("service2");
    class Service2Impl {
      constructor() {
      }
    }
    const Service21 = createDecorator("service21");
    let Service21Impl = class {
      constructor(service2, service1) {
        this.service2 = service2;
        this.service1 = service1;
      }
    };
    Service21Impl = __decorateClass([
      __decorateParam(0, Service22),
      __decorateParam(1, Service12)
    ], Service21Impl);
    const insta = new InstantiationService(new ServiceCollection(
      [Service12, new SyncDescriptor(Service1Impl)],
      [Service22, new SyncDescriptor(Service2Impl)],
      [Service21, new SyncDescriptor(Service21Impl)]
    ));
    const obj = insta.invokeFunction((accessor) => accessor.get(Service21));
    assert.ok(obj);
  });
  test("Sync/Async dependency loop", async function() {
    const A = createDecorator("A");
    const B = createDecorator("B");
    let BConsumer = class {
      constructor(b) {
        this.b = b;
      }
      doIt() {
        return this.b.b();
      }
    };
    BConsumer = __decorateClass([
      __decorateParam(0, B)
    ], BConsumer);
    let AService = class {
      constructor(insta) {
        this.prop = insta.createInstance(BConsumer);
      }
      doIt() {
        return this.prop.doIt();
      }
    };
    AService = __decorateClass([
      __decorateParam(0, IInstantiationService)
    ], AService);
    let BService = class {
      constructor(a) {
        assert.ok(a);
      }
      b() {
        return true;
      }
    };
    BService = __decorateClass([
      __decorateParam(0, A)
    ], BService);
    {
      const insta1 = new InstantiationService(new ServiceCollection(
        [A, new SyncDescriptor(AService)],
        [B, new SyncDescriptor(BService)]
      ), true, void 0, true);
      try {
        insta1.invokeFunction((accessor) => accessor.get(A));
        assert.ok(false);
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("RECURSIVELY"));
      }
    }
    {
      const insta2 = new InstantiationService(new ServiceCollection(
        [A, new SyncDescriptor(AService, void 0, true)],
        [B, new SyncDescriptor(BService, void 0)]
      ), true, void 0, true);
      const a = insta2.invokeFunction((accessor) => accessor.get(A));
      a.doIt();
      const cycle = insta2._globalGraph?.findCycleSlow();
      assert.strictEqual(cycle, "A -> B -> A");
    }
  });
  test("Delayed and events", function() {
    const A = createDecorator("A");
    let created = false;
    class AImpl {
      constructor() {
        this._doIt = 0;
        this._onDidDoIt = new Emitter();
        this.onDidDoIt = this._onDidDoIt.event;
        created = true;
      }
      doIt() {
        this._doIt += 1;
        this._onDidDoIt.fire(this);
      }
    }
    const insta = new InstantiationService(new ServiceCollection(
      [A, new SyncDescriptor(AImpl, void 0, true)]
    ), true, void 0, true);
    let Consumer = class {
      constructor(a) {
        this.a = a;
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, A)
    ], Consumer);
    const c = insta.createInstance(Consumer);
    let eventCount = 0;
    const listener = (e) => {
      assert.ok(e instanceof AImpl);
      eventCount++;
    };
    const d1 = c.a.onDidDoIt(listener);
    const d2 = c.a.onDidDoIt(listener);
    assert.strictEqual(created, false);
    assert.strictEqual(eventCount, 0);
    d2.dispose();
    c.a.doIt();
    assert.strictEqual(created, true);
    assert.strictEqual(eventCount, 1);
    const d3 = c.a.onDidDoIt(listener);
    c.a.doIt();
    assert.strictEqual(eventCount, 3);
    dispose([d1, d3]);
  });
  test("Capture event before init, use after init", function() {
    const A = createDecorator("A");
    let created = false;
    class AImpl {
      constructor() {
        this._doIt = 0;
        this._onDidDoIt = new Emitter();
        this.onDidDoIt = this._onDidDoIt.event;
        created = true;
      }
      doIt() {
        this._doIt += 1;
        this._onDidDoIt.fire(this);
      }
      noop() {
      }
    }
    const insta = new InstantiationService(new ServiceCollection(
      [A, new SyncDescriptor(AImpl, void 0, true)]
    ), true, void 0, true);
    let Consumer = class {
      constructor(a) {
        this.a = a;
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, A)
    ], Consumer);
    const c = insta.createInstance(Consumer);
    let eventCount = 0;
    const listener = (e) => {
      assert.ok(e instanceof AImpl);
      eventCount++;
    };
    const event = c.a.onDidDoIt;
    assert.strictEqual(created, false);
    c.a.noop();
    assert.strictEqual(created, true);
    const d1 = event(listener);
    c.a.doIt();
    assert.strictEqual(eventCount, 1);
    dispose(d1);
  });
  test("Dispose early event listener", function() {
    const A = createDecorator("A");
    let created = false;
    class AImpl {
      constructor() {
        this._doIt = 0;
        this._onDidDoIt = new Emitter();
        this.onDidDoIt = this._onDidDoIt.event;
        created = true;
      }
      doIt() {
        this._doIt += 1;
        this._onDidDoIt.fire(this);
      }
    }
    const insta = new InstantiationService(new ServiceCollection(
      [A, new SyncDescriptor(AImpl, void 0, true)]
    ), true, void 0, true);
    let Consumer = class {
      constructor(a) {
        this.a = a;
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, A)
    ], Consumer);
    const c = insta.createInstance(Consumer);
    let eventCount = 0;
    const listener = (e) => {
      assert.ok(e instanceof AImpl);
      eventCount++;
    };
    const d1 = c.a.onDidDoIt(listener);
    assert.strictEqual(created, false);
    assert.strictEqual(eventCount, 0);
    c.a.doIt();
    assert.strictEqual(created, true);
    assert.strictEqual(eventCount, 1);
    dispose(d1);
    c.a.doIt();
    assert.strictEqual(eventCount, 1);
  });
  test("Dispose services it created", function() {
    let disposedA = false;
    let disposedB = false;
    const A = createDecorator("A");
    class AImpl {
      constructor() {
        this.value = 1;
      }
      dispose() {
        disposedA = true;
      }
    }
    const B = createDecorator("B");
    class BImpl {
      constructor() {
        this.value = 1;
      }
      dispose() {
        disposedB = true;
      }
    }
    const insta = new InstantiationService(new ServiceCollection(
      [A, new SyncDescriptor(AImpl, void 0, true)],
      [B, new BImpl()]
    ), true, void 0, true);
    let Consumer = class {
      constructor(a, b) {
        this.a = a;
        this.b = b;
        assert.strictEqual(a.value, b.value);
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, A),
      __decorateParam(1, B)
    ], Consumer);
    const c = insta.createInstance(Consumer);
    insta.dispose();
    assert.ok(c);
    assert.strictEqual(disposedA, true);
    assert.strictEqual(disposedB, false);
  });
  test("Disposed service cannot be used anymore", function() {
    const B = createDecorator("B");
    class BImpl {
      constructor() {
        this.value = 1;
      }
    }
    const insta = new InstantiationService(new ServiceCollection(
      [B, new BImpl()]
    ), true, void 0, true);
    let Consumer = class {
      constructor(b) {
        this.b = b;
        assert.strictEqual(b.value, 1);
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, B)
    ], Consumer);
    const c = insta.createInstance(Consumer);
    assert.ok(c);
    insta.dispose();
    assert.throws(() => insta.createInstance(Consumer));
    assert.throws(() => insta.invokeFunction((accessor) => {
    }));
    assert.throws(() => insta.createChild(new ServiceCollection()));
  });
  test("Child does not dispose parent", function() {
    const B = createDecorator("B");
    class BImpl {
      constructor() {
        this.value = 1;
      }
    }
    const insta1 = new InstantiationService(new ServiceCollection(
      [B, new BImpl()]
    ), true, void 0, true);
    const insta2 = insta1.createChild(new ServiceCollection());
    let Consumer = class {
      constructor(b) {
        this.b = b;
        assert.strictEqual(b.value, 1);
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, B)
    ], Consumer);
    assert.ok(insta1.createInstance(Consumer));
    assert.ok(insta2.createInstance(Consumer));
    insta2.dispose();
    assert.ok(insta1.createInstance(Consumer));
    assert.throws(() => insta2.createInstance(Consumer));
  });
  test("Parent does dispose children", function() {
    const B = createDecorator("B");
    class BImpl {
      constructor() {
        this.value = 1;
      }
    }
    const insta1 = new InstantiationService(new ServiceCollection(
      [B, new BImpl()]
    ), true, void 0, true);
    const insta2 = insta1.createChild(new ServiceCollection());
    let Consumer = class {
      constructor(b) {
        this.b = b;
        assert.strictEqual(b.value, 1);
      }
    };
    Consumer = __decorateClass([
      __decorateParam(0, B)
    ], Consumer);
    assert.ok(insta1.createInstance(Consumer));
    assert.ok(insta2.createInstance(Consumer));
    insta1.dispose();
    assert.throws(() => insta2.createInstance(Consumer));
    assert.throws(() => insta1.createInstance(Consumer));
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcaW5zdGFudGlhdGlvblxcdGVzdFxcY29tbW9uXFxpbnN0YW50aWF0aW9uU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5cbmNvbnN0IElTZXJ2aWNlMSA9IGNyZWF0ZURlY29yYXRvcjxJU2VydmljZTE+KCdzZXJ2aWNlMScpO1xuXG5pbnRlcmZhY2UgSVNlcnZpY2UxIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRjOiBudW1iZXI7XG59XG5cbmNsYXNzIFNlcnZpY2UxIGltcGxlbWVudHMgSVNlcnZpY2UxIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGMgPSAxO1xufVxuXG5jb25zdCBJU2VydmljZTIgPSBjcmVhdGVEZWNvcmF0b3I8SVNlcnZpY2UyPignc2VydmljZTInKTtcblxuaW50ZXJmYWNlIElTZXJ2aWNlMiB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0ZDogYm9vbGVhbjtcbn1cblxuY2xhc3MgU2VydmljZTIgaW1wbGVtZW50cyBJU2VydmljZTIge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0ZCA9IHRydWU7XG59XG5cbmNvbnN0IElTZXJ2aWNlMyA9IGNyZWF0ZURlY29yYXRvcjxJU2VydmljZTM+KCdzZXJ2aWNlMycpO1xuXG5pbnRlcmZhY2UgSVNlcnZpY2UzIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRzOiBzdHJpbmc7XG59XG5cbmNsYXNzIFNlcnZpY2UzIGltcGxlbWVudHMgSVNlcnZpY2UzIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHMgPSAnZmFyYm9vJztcbn1cblxuY29uc3QgSURlcGVuZGVudFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SURlcGVuZGVudFNlcnZpY2U+KCdkZXBlbmRlbnRTZXJ2aWNlJyk7XG5cbmludGVyZmFjZSBJRGVwZW5kZW50U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0bmFtZTogc3RyaW5nO1xufVxuXG5jbGFzcyBEZXBlbmRlbnRTZXJ2aWNlIGltcGxlbWVudHMgSURlcGVuZGVudFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0Y29uc3RydWN0b3IoQElTZXJ2aWNlMSBzZXJ2aWNlOiBJU2VydmljZTEpIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jLCAxKTtcblx0fVxuXG5cdG5hbWUgPSAnZmFyYm9vJztcbn1cblxuY2xhc3MgU2VydmljZTFDb25zdW1lciB7XG5cblx0Y29uc3RydWN0b3IoQElTZXJ2aWNlMSBzZXJ2aWNlMTogSVNlcnZpY2UxKSB7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZTEuYywgMSk7XG5cdH1cbn1cblxuY2xhc3MgVGFyZ2V0MkRlcCB7XG5cblx0Y29uc3RydWN0b3IoQElTZXJ2aWNlMSBzZXJ2aWNlMTogSVNlcnZpY2UxLCBASVNlcnZpY2UyIHNlcnZpY2UyOiBTZXJ2aWNlMikge1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlMSBpbnN0YW5jZW9mIFNlcnZpY2UxKTtcblx0XHRhc3NlcnQub2soc2VydmljZTIgaW5zdGFuY2VvZiBTZXJ2aWNlMik7XG5cdH1cbn1cblxuY2xhc3MgVGFyZ2V0V2l0aFN0YXRpY1BhcmFtIHtcblx0Y29uc3RydWN0b3IodjogYm9vbGVhbiwgQElTZXJ2aWNlMSBzZXJ2aWNlMTogSVNlcnZpY2UxKSB7XG5cdFx0YXNzZXJ0Lm9rKHYpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UxLmMsIDEpO1xuXHR9XG59XG5cblxuXG5jbGFzcyBEZXBlbmRlbnRTZXJ2aWNlVGFyZ2V0IHtcblx0Y29uc3RydWN0b3IoQElEZXBlbmRlbnRTZXJ2aWNlIGQ6IElEZXBlbmRlbnRTZXJ2aWNlKSB7XG5cdFx0YXNzZXJ0Lm9rKGQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkLm5hbWUsICdmYXJib28nKTtcblx0fVxufVxuXG5jbGFzcyBEZXBlbmRlbnRTZXJ2aWNlVGFyZ2V0MiB7XG5cdGNvbnN0cnVjdG9yKEBJRGVwZW5kZW50U2VydmljZSBkOiBJRGVwZW5kZW50U2VydmljZSwgQElTZXJ2aWNlMSBzOiBJU2VydmljZTEpIHtcblx0XHRhc3NlcnQub2soZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGQubmFtZSwgJ2ZhcmJvbycpO1xuXHRcdGFzc2VydC5vayhzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocy5jLCAxKTtcblx0fVxufVxuXG5cbmNsYXNzIFNlcnZpY2VMb29wMSBpbXBsZW1lbnRzIElTZXJ2aWNlMSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRjID0gMTtcblxuXHRjb25zdHJ1Y3RvcihASVNlcnZpY2UyIHM6IElTZXJ2aWNlMikge1xuXG5cdH1cbn1cblxuY2xhc3MgU2VydmljZUxvb3AyIGltcGxlbWVudHMgSVNlcnZpY2UyIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGQgPSB0cnVlO1xuXG5cdGNvbnN0cnVjdG9yKEBJU2VydmljZTEgczogSVNlcnZpY2UxKSB7XG5cblx0fVxufVxuXG5zdWl0ZSgnSW5zdGFudGlhdGlvbiBTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdHRlc3QoJ3NlcnZpY2UgY29sbGVjdGlvbiwgY2Fubm90IG92ZXJ3cml0ZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0bGV0IHJlc3VsdCA9IGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMSwgbnVsbCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0cmVzdWx0ID0gY29sbGVjdGlvbi5zZXQoSVNlcnZpY2UxLCBuZXcgU2VydmljZTEoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcnZpY2UgY29sbGVjdGlvbiwgYWRkL2hhcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UxLCBudWxsISk7XG5cdFx0YXNzZXJ0Lm9rKGNvbGxlY3Rpb24uaGFzKElTZXJ2aWNlMSkpO1xuXG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UyLCBudWxsISk7XG5cdFx0YXNzZXJ0Lm9rKGNvbGxlY3Rpb24uaGFzKElTZXJ2aWNlMSkpO1xuXHRcdGFzc2VydC5vayhjb2xsZWN0aW9uLmhhcyhJU2VydmljZTIpKTtcblx0fSk7XG5cblx0dGVzdCgnQFBhcmFtIC0gc2ltcGxlIGNsYXNlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKGNvbGxlY3Rpb24pO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMSwgbmV3IFNlcnZpY2UxKCkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMiwgbmV3IFNlcnZpY2UyKCkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMywgbmV3IFNlcnZpY2UzKCkpO1xuXG5cdFx0c2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXJ2aWNlMUNvbnN1bWVyKTtcblx0fSk7XG5cblx0dGVzdCgnQFBhcmFtIC0gZml4ZWQgYXJncycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShjb2xsZWN0aW9uKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTEsIG5ldyBTZXJ2aWNlMSgpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTIsIG5ldyBTZXJ2aWNlMigpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTMsIG5ldyBTZXJ2aWNlMygpKTtcblxuXHRcdHNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGFyZ2V0V2l0aFN0YXRpY1BhcmFtLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc2VydmljZSBjb2xsZWN0aW9uIGlzIGxpdmUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UxLCBuZXcgU2VydmljZTEoKSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKGNvbGxlY3Rpb24pO1xuXHRcdHNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VydmljZTFDb25zdW1lcik7XG5cblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTIsIG5ldyBTZXJ2aWNlMigpKTtcblxuXHRcdHNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGFyZ2V0MkRlcCk7XG5cdFx0c2VydmljZS5pbnZva2VGdW5jdGlvbihmdW5jdGlvbiAoYSkge1xuXHRcdFx0YXNzZXJ0Lm9rKGEuZ2V0KElTZXJ2aWNlMSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGEuZ2V0KElTZXJ2aWNlMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyB3ZSBtYWRlIHRoaXMgYSB3YXJuaW5nXG5cdC8vIHRlc3QoJ0BQYXJhbSAtIHRvbyBtYW55IGFyZ3MnLCBmdW5jdGlvbiAoKSB7XG5cdC8vIFx0bGV0IHNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGUoT2JqZWN0LmNyZWF0ZShudWxsKSk7XG5cdC8vIFx0c2VydmljZS5hZGRTaW5nbGV0b24oSVNlcnZpY2UxLCBuZXcgU2VydmljZTEoKSk7XG5cdC8vIFx0c2VydmljZS5hZGRTaW5nbGV0b24oSVNlcnZpY2UyLCBuZXcgU2VydmljZTIoKSk7XG5cdC8vIFx0c2VydmljZS5hZGRTaW5nbGV0b24oSVNlcnZpY2UzLCBuZXcgU2VydmljZTMoKSk7XG5cblx0Ly8gXHRhc3NlcnQudGhyb3dzKCgpID0+IHNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGFyYW1ldGVyVGFyZ2V0MiwgdHJ1ZSwgMikpO1xuXHQvLyB9KTtcblxuXHQvLyB0ZXN0KCdAUGFyYW0gLSB0b28gZmV3IGFyZ3MnLCBmdW5jdGlvbiAoKSB7XG5cdC8vIFx0bGV0IHNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGUoT2JqZWN0LmNyZWF0ZShudWxsKSk7XG5cdC8vIFx0c2VydmljZS5hZGRTaW5nbGV0b24oSVNlcnZpY2UxLCBuZXcgU2VydmljZTEoKSk7XG5cdC8vIFx0c2VydmljZS5hZGRTaW5nbGV0b24oSVNlcnZpY2UyLCBuZXcgU2VydmljZTIoKSk7XG5cdC8vIFx0c2VydmljZS5hZGRTaW5nbGV0b24oSVNlcnZpY2UzLCBuZXcgU2VydmljZTMoKSk7XG5cblx0Ly8gXHRhc3NlcnQudGhyb3dzKCgpID0+IHNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGFyYW1ldGVyVGFyZ2V0MikpO1xuXHQvLyB9KTtcblxuXHR0ZXN0KCdTeW5jRGVzYyAtIG5vIGRlcGVuZGVuY2llcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShjb2xsZWN0aW9uKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTEsIG5ldyBTeW5jRGVzY3JpcHRvcjxJU2VydmljZTE+KFNlcnZpY2UxKSk7XG5cblx0XHRzZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblxuXHRcdFx0Y29uc3Qgc2VydmljZTEgPSBhY2Nlc3Nvci5nZXQoSVNlcnZpY2UxKTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZTEuYywgMSk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UyID0gYWNjZXNzb3IuZ2V0KElTZXJ2aWNlMSk7XG5cdFx0XHRhc3NlcnQub2soc2VydmljZTEgPT09IHNlcnZpY2UyKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU3luY0Rlc2MgLSBzZXJ2aWNlIHdpdGggc2VydmljZSBkZXBlbmRlbmN5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKGNvbGxlY3Rpb24pO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMSwgbmV3IFN5bmNEZXNjcmlwdG9yPElTZXJ2aWNlMT4oU2VydmljZTEpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJRGVwZW5kZW50U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yPElEZXBlbmRlbnRTZXJ2aWNlPihEZXBlbmRlbnRTZXJ2aWNlKSk7XG5cblx0XHRzZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IGQgPSBhY2Nlc3Nvci5nZXQoSURlcGVuZGVudFNlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKGQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGQubmFtZSwgJ2ZhcmJvbycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdTeW5jRGVzYyAtIHRhcmdldCBkZXBlbmRzIG9uIHNlcnZpY2UgZnV0dXJlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKGNvbGxlY3Rpb24pO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMSwgbmV3IFN5bmNEZXNjcmlwdG9yPElTZXJ2aWNlMT4oU2VydmljZTEpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJRGVwZW5kZW50U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yPElEZXBlbmRlbnRTZXJ2aWNlPihEZXBlbmRlbnRTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBkID0gc2VydmljZS5jcmVhdGVJbnN0YW5jZShEZXBlbmRlbnRTZXJ2aWNlVGFyZ2V0KTtcblx0XHRhc3NlcnQub2soZCBpbnN0YW5jZW9mIERlcGVuZGVudFNlcnZpY2VUYXJnZXQpO1xuXG5cdFx0Y29uc3QgZDIgPSBzZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlcGVuZGVudFNlcnZpY2VUYXJnZXQyKTtcblx0XHRhc3NlcnQub2soZDIgaW5zdGFuY2VvZiBEZXBlbmRlbnRTZXJ2aWNlVGFyZ2V0Mik7XG5cdH0pO1xuXG5cdHRlc3QoJ1N5bmNEZXNjIC0gZXhwbG9kZSBvbiBsb29wJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKGNvbGxlY3Rpb24pO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMSwgbmV3IFN5bmNEZXNjcmlwdG9yPElTZXJ2aWNlMT4oU2VydmljZUxvb3AxKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UyLCBuZXcgU3luY0Rlc2NyaXB0b3I8SVNlcnZpY2UyPihTZXJ2aWNlTG9vcDIpKTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0c2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLmdldChJU2VydmljZTEpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElTZXJ2aWNlMik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRzZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElTZXJ2aWNlMSk7XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFzc2VydC5vayhlcnIubmFtZSk7XG5cdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnSW52b2tlIC0gZ2V0IHNlcnZpY2VzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKGNvbGxlY3Rpb24pO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMSwgbmV3IFNlcnZpY2UxKCkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElTZXJ2aWNlMiwgbmV3IFNlcnZpY2UyKCkpO1xuXG5cdFx0ZnVuY3Rpb24gdGVzdChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0YXNzZXJ0Lm9rKGFjY2Vzc29yLmdldChJU2VydmljZTEpIGluc3RhbmNlb2YgU2VydmljZTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjY2Vzc29yLmdldChJU2VydmljZTEpLmMsIDEpO1xuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pbnZva2VGdW5jdGlvbih0ZXN0KSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ludm9rZSAtIGdldCBzZXJ2aWNlLCBvcHRpb25hbCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJU2VydmljZTEsIG5ldyBTZXJ2aWNlMSgpXSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShjb2xsZWN0aW9uLCB0cnVlKTtcblxuXHRcdGZ1bmN0aW9uIHRlc3QoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdGFzc2VydC5vayhhY2Nlc3Nvci5nZXQoSVNlcnZpY2UxKSBpbnN0YW5jZW9mIFNlcnZpY2UxKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gYWNjZXNzb3IuZ2V0KElTZXJ2aWNlMikpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHRlc3QpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnSW52b2tlIC0ga2VlcGluZyBhY2Nlc3NvciBOT1QgYWxsb3dlZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShjb2xsZWN0aW9uKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTEsIG5ldyBTZXJ2aWNlMSgpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJU2VydmljZTIsIG5ldyBTZXJ2aWNlMigpKTtcblxuXHRcdGxldCBjYWNoZWQ6IFNlcnZpY2VzQWNjZXNzb3I7XG5cblx0XHRmdW5jdGlvbiB0ZXN0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRhc3NlcnQub2soYWNjZXNzb3IuZ2V0KElTZXJ2aWNlMSkgaW5zdGFuY2VvZiBTZXJ2aWNlMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXNzb3IuZ2V0KElTZXJ2aWNlMSkuYywgMSk7XG5cdFx0XHRjYWNoZWQgPSBhY2Nlc3Nvcjtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHRlc3QpLCB0cnVlKTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gY2FjaGVkLmdldChJU2VydmljZTIpKTtcblx0fSk7XG5cblx0dGVzdCgnSW52b2tlIC0gdGhyb3cgZXJyb3InLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UoY29sbGVjdGlvbik7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UxLCBuZXcgU2VydmljZTEoKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVNlcnZpY2UyLCBuZXcgU2VydmljZTIoKSk7XG5cblx0XHRmdW5jdGlvbiB0ZXN0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoKTtcblx0XHR9XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHNlcnZpY2UuaW52b2tlRnVuY3Rpb24odGVzdCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdDcmVhdGUgY2hpbGQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgc2VydmljZUluc3RhbmNlQ291bnQgPSAwO1xuXG5cdFx0Y29uc3QgQ3RvckNvdW50ZXIgPSBjbGFzcyBpbXBsZW1lbnRzIFNlcnZpY2UxIHtcblx0XHRcdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0YyA9IDE7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c2VydmljZUluc3RhbmNlQ291bnQgKz0gMTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gY3JlYXRpbmcgdGhlIHNlcnZpY2UgaW5zdGFuY2UgQkVGT1JFIHRoZSBjaGlsZCBzZXJ2aWNlXG5cdFx0bGV0IHNlcnZpY2UgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJU2VydmljZTEsIG5ldyBTeW5jRGVzY3JpcHRvcihDdG9yQ291bnRlcildKSk7XG5cdFx0c2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXJ2aWNlMUNvbnN1bWVyKTtcblxuXHRcdC8vIHNlY29uZCBpbnN0YW5jZSBtdXN0IGJlIGVhcmxpZXIgT05FXG5cdFx0bGV0IGNoaWxkID0gc2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lTZXJ2aWNlMiwgbmV3IFNlcnZpY2UyKCldKSk7XG5cdFx0Y2hpbGQuY3JlYXRlSW5zdGFuY2UoU2VydmljZTFDb25zdW1lcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZUluc3RhbmNlQ291bnQsIDEpO1xuXG5cdFx0Ly8gY3JlYXRpbmcgdGhlIHNlcnZpY2UgaW5zdGFuY2UgQUZURVIgdGhlIGNoaWxkIHNlcnZpY2Vcblx0XHRzZXJ2aWNlSW5zdGFuY2VDb3VudCA9IDA7XG5cdFx0c2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lTZXJ2aWNlMSwgbmV3IFN5bmNEZXNjcmlwdG9yKEN0b3JDb3VudGVyKV0pKTtcblx0XHRjaGlsZCA9IHNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJU2VydmljZTIsIG5ldyBTZXJ2aWNlMigpXSkpO1xuXG5cdFx0Ly8gc2Vjb25kIGluc3RhbmNlIG11c3QgYmUgZWFybGllciBPTkVcblx0XHRzZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlcnZpY2UxQ29uc3VtZXIpO1xuXHRcdGNoaWxkLmNyZWF0ZUluc3RhbmNlKFNlcnZpY2UxQ29uc3VtZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2VJbnN0YW5jZUNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnUmVtb3RlIHdpbmRvdyAvIGludGVncmF0aW9uIHRlc3RzIGlzIGJyb2tlbiAjMTA1NTYyJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgU2VydmljZTEgPSBjcmVhdGVEZWNvcmF0b3I8YW55Pignc2VydmljZTEnKTtcblx0XHRjbGFzcyBTZXJ2aWNlMUltcGwge1xuXHRcdFx0Y29uc3RydWN0b3IoQElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSB7XG5cdFx0XHRcdGNvbnN0IGMgPSBpbnN0YS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoU2VydmljZTIpKTsgLy8gVEhJUyBpcyB0aGUgcmVjdXJzaXZlIGNhbGxcblx0XHRcdFx0YXNzZXJ0Lm9rKGMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBTZXJ2aWNlMiA9IGNyZWF0ZURlY29yYXRvcjxhbnk+KCdzZXJ2aWNlMicpO1xuXHRcdGNsYXNzIFNlcnZpY2UySW1wbCB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgfVxuXHRcdH1cblxuXHRcdC8vIFRoaXMgc2VydmljZSBkZXBlbmRzIG9uIFNlcnZpY2UxIGFuZCBTZXJ2aWNlMiBCVVQgY3JlYXRpbmcgU2VydmljZTEgY3JlYXRlcyBTZXJ2aWNlMiAodmlhIHJlY3Vyc2l2ZSBpbnZvY2F0aW9uKVxuXHRcdC8vIGFuZCB0aGVuIFNlcnZjZTIgc2hvdWxkIG5vdCBiZSBjcmVhdGVkIGEgc2Vjb25kIHRpbWVcblx0XHRjb25zdCBTZXJ2aWNlMjEgPSBjcmVhdGVEZWNvcmF0b3I8YW55Pignc2VydmljZTIxJyk7XG5cdFx0Y2xhc3MgU2VydmljZTIxSW1wbCB7XG5cdFx0XHRjb25zdHJ1Y3RvcihAU2VydmljZTIgcHVibGljIHJlYWRvbmx5IHNlcnZpY2UyOiBTZXJ2aWNlMkltcGwsIEBTZXJ2aWNlMSBwdWJsaWMgcmVhZG9ubHkgc2VydmljZTE6IFNlcnZpY2UxSW1wbCkgeyB9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGEgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W1NlcnZpY2UxLCBuZXcgU3luY0Rlc2NyaXB0b3IoU2VydmljZTFJbXBsKV0sXG5cdFx0XHRbU2VydmljZTIsIG5ldyBTeW5jRGVzY3JpcHRvcihTZXJ2aWNlMkltcGwpXSxcblx0XHRcdFtTZXJ2aWNlMjEsIG5ldyBTeW5jRGVzY3JpcHRvcihTZXJ2aWNlMjFJbXBsKV0sXG5cdFx0KSk7XG5cblx0XHRjb25zdCBvYmogPSBpbnN0YS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoU2VydmljZTIxKSk7XG5cdFx0YXNzZXJ0Lm9rKG9iaik7XG5cdH0pO1xuXG5cdHRlc3QoJ1N5bmMvQXN5bmMgZGVwZW5kZW5jeSBsb29wJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgQSA9IGNyZWF0ZURlY29yYXRvcjxBPignQScpO1xuXHRcdGNvbnN0IEIgPSBjcmVhdGVEZWNvcmF0b3I8Qj4oJ0InKTtcblx0XHRpbnRlcmZhY2UgQSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDsgZG9JdCgpOiB2b2lkIH1cblx0XHRpbnRlcmZhY2UgQiB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDsgYigpOiBib29sZWFuIH1cblxuXHRcdGNsYXNzIEJDb25zdW1lciB7XG5cdFx0XHRjb25zdHJ1Y3RvcihAQiBwcml2YXRlIHJlYWRvbmx5IGI6IEIpIHtcblxuXHRcdFx0fVxuXHRcdFx0ZG9JdCgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuYi5iKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y2xhc3MgQVNlcnZpY2UgaW1wbGVtZW50cyBBIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdHByb3A6IEJDb25zdW1lcjtcblx0XHRcdGNvbnN0cnVjdG9yKEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGE6IElJbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHRcdFx0XHR0aGlzLnByb3AgPSBpbnN0YS5jcmVhdGVJbnN0YW5jZShCQ29uc3VtZXIpO1xuXHRcdFx0fVxuXHRcdFx0ZG9JdCgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucHJvcC5kb0l0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y2xhc3MgQlNlcnZpY2UgaW1wbGVtZW50cyBCIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0cnVjdG9yKEBBIGE6IEEpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGEpO1xuXHRcdFx0fVxuXHRcdFx0YigpIHsgcmV0dXJuIHRydWU7IH1cblx0XHR9XG5cblx0XHQvLyBTWU5DIC0+IGV4cGxvZGVzIEFJbXBsIC0+IFtpbnN0YTpCQ29uc3VtZXJdIC0+IEJJbXBsIC0+IEFJbXBsXG5cdFx0e1xuXHRcdFx0Y29uc3QgaW5zdGExID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFx0W0EsIG5ldyBTeW5jRGVzY3JpcHRvcihBU2VydmljZSldLFxuXHRcdFx0XHRbQiwgbmV3IFN5bmNEZXNjcmlwdG9yKEJTZXJ2aWNlKV0sXG5cdFx0XHQpLCB0cnVlLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpbnN0YTEuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KEEpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGZhbHNlKTtcblxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpO1xuXHRcdFx0XHRhc3NlcnQub2soZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnUkVDVVJTSVZFTFknKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQVNZTkMgLT4gZG9lc24ndCBleHBsb2RlIGJ1dCBjeWNsZSBpcyB0cmFja2VkXG5cdFx0e1xuXHRcdFx0Y29uc3QgaW5zdGEyID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFx0W0EsIG5ldyBTeW5jRGVzY3JpcHRvcihBU2VydmljZSwgdW5kZWZpbmVkLCB0cnVlKV0sXG5cdFx0XHRcdFtCLCBuZXcgU3luY0Rlc2NyaXB0b3IoQlNlcnZpY2UsIHVuZGVmaW5lZCldLFxuXHRcdFx0KSwgdHJ1ZSwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgYSA9IGluc3RhMi5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoQSkpO1xuXHRcdFx0YS5kb0l0KCk7XG5cblx0XHRcdGNvbnN0IGN5Y2xlID0gaW5zdGEyLl9nbG9iYWxHcmFwaD8uZmluZEN5Y2xlU2xvdygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN5Y2xlLCAnQSAtPiBCIC0+IEEnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0RlbGF5ZWQgYW5kIGV2ZW50cycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBBID0gY3JlYXRlRGVjb3JhdG9yPEE+KCdBJyk7XG5cdFx0aW50ZXJmYWNlIEEge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0cmVhZG9ubHkgb25EaWREb0l0OiBFdmVudDxhbnk+O1xuXHRcdFx0ZG9JdCgpOiB2b2lkO1xuXHRcdH1cblxuXHRcdGxldCBjcmVhdGVkID0gZmFsc2U7XG5cdFx0Y2xhc3MgQUltcGwgaW1wbGVtZW50cyBBIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdF9kb0l0ID0gMDtcblxuXHRcdFx0X29uRGlkRG9JdCA9IG5ldyBFbWl0dGVyPHRoaXM+KCk7XG5cdFx0XHRyZWFkb25seSBvbkRpZERvSXQ6IEV2ZW50PHRoaXM+ID0gdGhpcy5fb25EaWREb0l0LmV2ZW50O1xuXG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0Y3JlYXRlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGRvSXQoKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuX2RvSXQgKz0gMTtcblx0XHRcdFx0dGhpcy5fb25EaWREb0l0LmZpcmUodGhpcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGEgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0EsIG5ldyBTeW5jRGVzY3JpcHRvcihBSW1wbCwgdW5kZWZpbmVkLCB0cnVlKV0sXG5cdFx0KSwgdHJ1ZSwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdGNsYXNzIENvbnN1bWVyIHtcblx0XHRcdGNvbnN0cnVjdG9yKEBBIHB1YmxpYyByZWFkb25seSBhOiBBKSB7XG5cdFx0XHRcdC8vIGVhZ2VyIHN1YnNjcmliZSAtPiBOTyBzZXJ2aWNlIGluc3RhbmNlXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYzogQ29uc3VtZXIgPSBpbnN0YS5jcmVhdGVJbnN0YW5jZShDb25zdW1lcik7XG5cdFx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXG5cdFx0Ly8gc3Vic2NyaWJpbmcgdG8gZXZlbnQgZG9lc24ndCB0cmlnZ2VyIGluc3RhbnRpYXRpb25cblx0XHRjb25zdCBsaXN0ZW5lciA9IChlOiBhbnkpID0+IHtcblx0XHRcdGFzc2VydC5vayhlIGluc3RhbmNlb2YgQUltcGwpO1xuXHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdH07XG5cdFx0Y29uc3QgZDEgPSBjLmEub25EaWREb0l0KGxpc3RlbmVyKTtcblx0XHRjb25zdCBkMiA9IGMuYS5vbkRpZERvSXQobGlzdGVuZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDApO1xuXHRcdGQyLmRpc3Bvc2UoKTtcblxuXHRcdC8vIGluc3RhbnRpYXRpb24gaGFwcGVucyBvbiBmaXJzdCBjYWxsXG5cdFx0Yy5hLmRvSXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDEpO1xuXG5cblx0XHRjb25zdCBkMyA9IGMuYS5vbkRpZERvSXQobGlzdGVuZXIpO1xuXHRcdGMuYS5kb0l0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDMpO1xuXG5cdFx0ZGlzcG9zZShbZDEsIGQzXSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnQ2FwdHVyZSBldmVudCBiZWZvcmUgaW5pdCwgdXNlIGFmdGVyIGluaXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgQSA9IGNyZWF0ZURlY29yYXRvcjxBPignQScpO1xuXHRcdGludGVyZmFjZSBBIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdHJlYWRvbmx5IG9uRGlkRG9JdDogRXZlbnQ8YW55Pjtcblx0XHRcdGRvSXQoKTogdm9pZDtcblx0XHRcdG5vb3AoKTogdm9pZDtcblx0XHR9XG5cblx0XHRsZXQgY3JlYXRlZCA9IGZhbHNlO1xuXHRcdGNsYXNzIEFJbXBsIGltcGxlbWVudHMgQSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHRfZG9JdCA9IDA7XG5cblx0XHRcdF9vbkRpZERvSXQgPSBuZXcgRW1pdHRlcjx0aGlzPigpO1xuXHRcdFx0cmVhZG9ubHkgb25EaWREb0l0OiBFdmVudDx0aGlzPiA9IHRoaXMuX29uRGlkRG9JdC5ldmVudDtcblxuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdGNyZWF0ZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRkb0l0KCk6IHZvaWQge1xuXHRcdFx0XHR0aGlzLl9kb0l0ICs9IDE7XG5cdFx0XHRcdHRoaXMuX29uRGlkRG9JdC5maXJlKHRoaXMpO1xuXHRcdFx0fVxuXG5cdFx0XHRub29wKCk6IHZvaWQge1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtBLCBuZXcgU3luY0Rlc2NyaXB0b3IoQUltcGwsIHVuZGVmaW5lZCwgdHJ1ZSldLFxuXHRcdCksIHRydWUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRjbGFzcyBDb25zdW1lciB7XG5cdFx0XHRjb25zdHJ1Y3RvcihAQSBwdWJsaWMgcmVhZG9ubHkgYTogQSkge1xuXHRcdFx0XHQvLyBlYWdlciBzdWJzY3JpYmUgLT4gTk8gc2VydmljZSBpbnN0YW5jZVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGM6IENvbnN1bWVyID0gaW5zdGEuY3JlYXRlSW5zdGFuY2UoQ29uc3VtZXIpO1xuXHRcdGxldCBldmVudENvdW50ID0gMDtcblxuXHRcdC8vIHN1YnNjcmliaW5nIHRvIGV2ZW50IGRvZXNuJ3QgdHJpZ2dlciBpbnN0YW50aWF0aW9uXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSAoZTogYW55KSA9PiB7XG5cdFx0XHRhc3NlcnQub2soZSBpbnN0YW5jZW9mIEFJbXBsKTtcblx0XHRcdGV2ZW50Q291bnQrKztcblx0XHR9O1xuXG5cdFx0Y29uc3QgZXZlbnQgPSBjLmEub25EaWREb0l0O1xuXG5cdFx0Ly8gY29uc3QgZDEgPSBjLmEub25EaWREb0l0KGxpc3RlbmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZCwgZmFsc2UpO1xuXG5cdFx0Yy5hLm5vb3AoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZCwgdHJ1ZSk7XG5cblx0XHRjb25zdCBkMSA9IGV2ZW50KGxpc3RlbmVyKTtcblxuXHRcdGMuYS5kb0l0KCk7XG5cblxuXHRcdC8vIGluc3RhbnRpYXRpb24gaGFwcGVucyBvbiBmaXJzdCBjYWxsXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDEpO1xuXG5cdFx0ZGlzcG9zZShkMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0Rpc3Bvc2UgZWFybHkgZXZlbnQgbGlzdGVuZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgQSA9IGNyZWF0ZURlY29yYXRvcjxBPignQScpO1xuXHRcdGludGVyZmFjZSBBIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdHJlYWRvbmx5IG9uRGlkRG9JdDogRXZlbnQ8YW55Pjtcblx0XHRcdGRvSXQoKTogdm9pZDtcblx0XHR9XG5cdFx0bGV0IGNyZWF0ZWQgPSBmYWxzZTtcblx0XHRjbGFzcyBBSW1wbCBpbXBsZW1lbnRzIEEge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0X2RvSXQgPSAwO1xuXG5cdFx0XHRfb25EaWREb0l0ID0gbmV3IEVtaXR0ZXI8dGhpcz4oKTtcblx0XHRcdHJlYWRvbmx5IG9uRGlkRG9JdDogRXZlbnQ8dGhpcz4gPSB0aGlzLl9vbkRpZERvSXQuZXZlbnQ7XG5cblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRjcmVhdGVkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0ZG9JdCgpOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5fZG9JdCArPSAxO1xuXHRcdFx0XHR0aGlzLl9vbkRpZERvSXQuZmlyZSh0aGlzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbQSwgbmV3IFN5bmNEZXNjcmlwdG9yKEFJbXBsLCB1bmRlZmluZWQsIHRydWUpXSxcblx0XHQpLCB0cnVlLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0Y2xhc3MgQ29uc3VtZXIge1xuXHRcdFx0Y29uc3RydWN0b3IoQEEgcHVibGljIHJlYWRvbmx5IGE6IEEpIHtcblx0XHRcdFx0Ly8gZWFnZXIgc3Vic2NyaWJlIC0+IE5PIHNlcnZpY2UgaW5zdGFuY2Vcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjOiBDb25zdW1lciA9IGluc3RhLmNyZWF0ZUluc3RhbmNlKENvbnN1bWVyKTtcblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cblx0XHQvLyBzdWJzY3JpYmluZyB0byBldmVudCBkb2Vzbid0IHRyaWdnZXIgaW5zdGFudGlhdGlvblxuXHRcdGNvbnN0IGxpc3RlbmVyID0gKGU6IGFueSkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGUgaW5zdGFuY2VvZiBBSW1wbCk7XG5cdFx0XHRldmVudENvdW50Kys7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGQxID0gYy5hLm9uRGlkRG9JdChsaXN0ZW5lcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMCk7XG5cblx0XHRjLmEuZG9JdCgpO1xuXG5cdFx0Ly8gaW5zdGFudGlhdGlvbiBoYXBwZW5zIG9uIGZpcnN0IGNhbGxcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDEpO1xuXG5cdFx0ZGlzcG9zZShkMSk7XG5cblx0XHRjLmEuZG9JdCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCAxKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdEaXNwb3NlIHNlcnZpY2VzIGl0IGNyZWF0ZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGRpc3Bvc2VkQSA9IGZhbHNlO1xuXHRcdGxldCBkaXNwb3NlZEIgPSBmYWxzZTtcblxuXHRcdGNvbnN0IEEgPSBjcmVhdGVEZWNvcmF0b3I8QT4oJ0EnKTtcblx0XHRpbnRlcmZhY2UgQSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHR2YWx1ZTogMTtcblx0XHR9XG5cdFx0Y2xhc3MgQUltcGwgaW1wbGVtZW50cyBBIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdHZhbHVlOiAxID0gMTtcblx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdGRpc3Bvc2VkQSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgQiA9IGNyZWF0ZURlY29yYXRvcjxCPignQicpO1xuXHRcdGludGVyZmFjZSBCIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdHZhbHVlOiAxO1xuXHRcdH1cblx0XHRjbGFzcyBCSW1wbCBpbXBsZW1lbnRzIEIge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0dmFsdWU6IDEgPSAxO1xuXHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0ZGlzcG9zZWRCID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbQSwgbmV3IFN5bmNEZXNjcmlwdG9yKEFJbXBsLCB1bmRlZmluZWQsIHRydWUpXSxcblx0XHRcdFtCLCBuZXcgQkltcGwoKV0sXG5cdFx0KSwgdHJ1ZSwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdGNsYXNzIENvbnN1bWVyIHtcblx0XHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0XHRAQSBwdWJsaWMgcmVhZG9ubHkgYTogQSxcblx0XHRcdFx0QEIgcHVibGljIHJlYWRvbmx5IGI6IEJcblx0XHRcdCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS52YWx1ZSwgYi52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYzogQ29uc3VtZXIgPSBpbnN0YS5jcmVhdGVJbnN0YW5jZShDb25zdW1lcik7XG5cblx0XHRpbnN0YS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0Lm9rKGMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZEEsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZEIsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnRGlzcG9zZWQgc2VydmljZSBjYW5ub3QgYmUgdXNlZCBhbnltb3JlJywgZnVuY3Rpb24gKCkge1xuXG5cblx0XHRjb25zdCBCID0gY3JlYXRlRGVjb3JhdG9yPEI+KCdCJyk7XG5cdFx0aW50ZXJmYWNlIEIge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0dmFsdWU6IDE7XG5cdFx0fVxuXHRcdGNsYXNzIEJJbXBsIGltcGxlbWVudHMgQiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHR2YWx1ZTogMSA9IDE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGEgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0IsIG5ldyBCSW1wbCgpXSxcblx0XHQpLCB0cnVlLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0Y2xhc3MgQ29uc3VtZXIge1xuXHRcdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRcdEBCIHB1YmxpYyByZWFkb25seSBiOiBCXG5cdFx0XHQpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudmFsdWUsIDEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGM6IENvbnN1bWVyID0gaW5zdGEuY3JlYXRlSW5zdGFuY2UoQ29uc3VtZXIpO1xuXHRcdGFzc2VydC5vayhjKTtcblxuXHRcdGluc3RhLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gaW5zdGEuY3JlYXRlSW5zdGFuY2UoQ29uc3VtZXIpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGluc3RhLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHsgfSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gaW5zdGEuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKCkpKTtcblx0fSk7XG5cblx0dGVzdCgnQ2hpbGQgZG9lcyBub3QgZGlzcG9zZSBwYXJlbnQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBCID0gY3JlYXRlRGVjb3JhdG9yPEI+KCdCJyk7XG5cdFx0aW50ZXJmYWNlIEIge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0dmFsdWU6IDE7XG5cdFx0fVxuXHRcdGNsYXNzIEJJbXBsIGltcGxlbWVudHMgQiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHR2YWx1ZTogMSA9IDE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGExID0gbmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtCLCBuZXcgQkltcGwoKV0sXG5cdFx0KSwgdHJ1ZSwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdGNvbnN0IGluc3RhMiA9IGluc3RhMS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oKSk7XG5cblx0XHRjbGFzcyBDb25zdW1lciB7XG5cdFx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdFx0QEIgcHVibGljIHJlYWRvbmx5IGI6IEJcblx0XHRcdCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi52YWx1ZSwgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGluc3RhMS5jcmVhdGVJbnN0YW5jZShDb25zdW1lcikpO1xuXHRcdGFzc2VydC5vayhpbnN0YTIuY3JlYXRlSW5zdGFuY2UoQ29uc3VtZXIpKTtcblxuXHRcdGluc3RhMi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQub2soaW5zdGExLmNyZWF0ZUluc3RhbmNlKENvbnN1bWVyKSk7IC8vIHBhcmVudCBOT1QgZGlzcG9zZWQgYnkgY2hpbGRcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGluc3RhMi5jcmVhdGVJbnN0YW5jZShDb25zdW1lcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdQYXJlbnQgZG9lcyBkaXNwb3NlIGNoaWxkcmVuJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgQiA9IGNyZWF0ZURlY29yYXRvcjxCPignQicpO1xuXHRcdGludGVyZmFjZSBCIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdHZhbHVlOiAxO1xuXHRcdH1cblx0XHRjbGFzcyBCSW1wbCBpbXBsZW1lbnRzIEIge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0dmFsdWU6IDEgPSAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhMSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbQiwgbmV3IEJJbXBsKCldLFxuXHRcdCksIHRydWUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRjb25zdCBpbnN0YTIgPSBpbnN0YTEuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKCkpO1xuXG5cdFx0Y2xhc3MgQ29uc3VtZXIge1xuXHRcdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRcdEBCIHB1YmxpYyByZWFkb25seSBiOiBCXG5cdFx0XHQpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudmFsdWUsIDEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFzc2VydC5vayhpbnN0YTEuY3JlYXRlSW5zdGFuY2UoQ29uc3VtZXIpKTtcblx0XHRhc3NlcnQub2soaW5zdGEyLmNyZWF0ZUluc3RhbmNlKENvbnN1bWVyKSk7XG5cblx0XHRpbnN0YTEuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpbnN0YTIuY3JlYXRlSW5zdGFuY2UoQ29uc3VtZXIpKTsgLy8gY2hpbGQgaXMgZGlzcG9zZWQgYnkgcGFyZW50XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpbnN0YTEuY3JlYXRlSW5zdGFuY2UoQ29uc3VtZXIpKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLDZCQUErQztBQUN6RSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLFlBQVksZ0JBQTJCLFVBQVU7QUFPdkQsTUFBTSxTQUE4QjtBQUFBLEVBQXBDO0FBRUMsYUFBSTtBQUFBO0FBQ0w7QUFFQSxNQUFNLFlBQVksZ0JBQTJCLFVBQVU7QUFPdkQsTUFBTSxTQUE4QjtBQUFBLEVBQXBDO0FBRUMsYUFBSTtBQUFBO0FBQ0w7QUFFQSxNQUFNLFlBQVksZ0JBQTJCLFVBQVU7QUFPdkQsTUFBTSxTQUE4QjtBQUFBLEVBQXBDO0FBRUMsYUFBSTtBQUFBO0FBQ0w7QUFFQSxNQUFNLG9CQUFvQixnQkFBbUMsa0JBQWtCO0FBTy9FLElBQU0sbUJBQU4sTUFBb0Q7QUFBQSxFQUVuRCxZQUF1QixTQUFvQjtBQUkzQyxnQkFBTztBQUhOLFdBQU8sWUFBWSxRQUFRLEdBQUcsQ0FBQztBQUFBLEVBQ2hDO0FBR0Q7QUFQTSxtQkFBTjtBQUFBLEVBRWM7QUFBQSxHQUZSO0FBU04sSUFBTSxtQkFBTixNQUF1QjtBQUFBLEVBRXRCLFlBQXVCLFVBQXFCO0FBQzNDLFdBQU8sR0FBRyxRQUFRO0FBQ2xCLFdBQU8sWUFBWSxTQUFTLEdBQUcsQ0FBQztBQUFBLEVBQ2pDO0FBQ0Q7QUFOTSxtQkFBTjtBQUFBLEVBRWM7QUFBQSxHQUZSO0FBUU4sSUFBTSxhQUFOLE1BQWlCO0FBQUEsRUFFaEIsWUFBdUIsVUFBZ0MsVUFBb0I7QUFDMUUsV0FBTyxHQUFHLG9CQUFvQixRQUFRO0FBQ3RDLFdBQU8sR0FBRyxvQkFBb0IsUUFBUTtBQUFBLEVBQ3ZD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
