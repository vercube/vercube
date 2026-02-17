import { n as serve, t as NodeResponse } from "../_libs/srvx.mjs";
import { n as createRouter, r as findRoute, t as addRoute } from "../_libs/rou3.mjs";
import { AsyncLocalStorage } from "node:async_hooks";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { stat } from "node:fs/promises";
var BaseDecorator = class {
	options;
	instance;
	prototype;
	propertyName;
	descriptor;
	propertyIndex;
	created() {}
	destroyed() {}
};
function createDecorator(decoratorClass, params) {
	return function internalDecorator(target, propertyName, descriptor) {
		if (!target.__decorators) target.__decorators = [];
		target.__decorators.push({
			classType: decoratorClass,
			params,
			target,
			propertyName,
			descriptor
		});
	};
}
const containerMap = /* @__PURE__ */ new Map();
function getContainerMetadata(container) {
	if (!containerMap.has(container)) containerMap.set(container, { decoratedInstances: /* @__PURE__ */ new Map() });
	return containerMap.get(container);
}
function initializeDecorators(target, container) {
	const prototype = Object.getPrototypeOf(target);
	if (prototype.__decorators) for (const entry of prototype.__decorators) {
		const instance = container.resolve(entry.classType);
		if (instance) {
			instance.options = entry.params;
			instance.instance = target;
			instance.prototype = prototype;
			instance.propertyName = entry.propertyName;
			instance.descriptor = entry.descriptor;
			instance.propertyIndex = typeof entry.descriptor === "number" ? entry.descriptor : -1;
			instance.created();
		}
		const { decoratedInstances } = getContainerMetadata(container);
		const instanceList = decoratedInstances.get(target) ?? [];
		instanceList.push(instance);
		decoratedInstances.set(target, instanceList);
	}
}
function destroyDecorators(target, container) {
	const { decoratedInstances } = getContainerMetadata(container);
	const instanceList = decoratedInstances.get(target);
	if (instanceList) for (const instance of instanceList) instance.destroyed();
	decoratedInstances.delete(target);
}
function initializeContainer(container) {
	container.flushQueue();
}
var ContainerEvents = class {
	fOnExpanded = [];
	onExpanded(handler) {
		this.fOnExpanded.push(handler);
	}
	callOnExpanded(serviceKeys) {
		for (const handler of this.fOnExpanded) handler(serviceKeys);
	}
};
var Container = class Container {
	fContext;
	fLocked = false;
	fDefaultParams = {
		context: void 0,
		createLocked: false
	};
	fServices = /* @__PURE__ */ new Map();
	fNewQueue = /* @__PURE__ */ new Map();
	fSingletonInstances = /* @__PURE__ */ new Map();
	fInjectMethod = IOC.InjectMethod.STATIC;
	fContainerEvents = new ContainerEvents();
	constructor(params) {
		this.fContext = params?.context ?? "default";
		this.fLocked = params?.createLocked ?? false;
		this.fDefaultParams = Object.assign(this.fDefaultParams, params);
		this.fInjectMethod = params?.injectMethod ?? IOC.InjectMethod.STATIC;
		this.bindInstance(Container, this);
	}
	get servicesKeys() {
		return [...this.fServices.keys()];
	}
	get events() {
		return this.fContainerEvents;
	}
	get context() {
		return this.fContext;
	}
	bind(key, value) {
		const newDef = {
			serviceKey: key,
			serviceValue: value ?? key,
			type: IOC.ServiceFactoryType.CLASS_SINGLETON
		};
		if (typeof key === "symbol" && !value) throw new Error("Container - provide implementation for binds with symbols.");
		const existingServiceDef = this.fServices.get(key);
		if (existingServiceDef) {
			this.internalDispose(existingServiceDef);
			this.fServices.delete(key);
		}
		this.fServices.set(key, newDef);
		this.fNewQueue.set(key, newDef);
	}
	bindTransient(key, value) {
		const newDef = {
			serviceKey: key,
			serviceValue: value ?? key,
			type: IOC.ServiceFactoryType.CLASS
		};
		const existingServiceDef = this.fServices.get(key);
		if (existingServiceDef) this.internalDispose(existingServiceDef);
		this.fServices.set(key, newDef);
		this.fNewQueue.set(key, newDef);
	}
	bindInstance(key, value) {
		const newDef = {
			serviceKey: key,
			serviceValue: value,
			type: IOC.ServiceFactoryType.INSTANCE
		};
		const existingServiceDef = this.fServices.get(key);
		if (existingServiceDef) this.internalDispose(existingServiceDef);
		this.fServices.set(key, newDef);
		this.fNewQueue.set(key, newDef);
	}
	bindMock(key, mockInstance) {
		const newDef = {
			serviceKey: key,
			serviceValue: mockInstance,
			type: IOC.ServiceFactoryType.INSTANCE
		};
		const existingServiceDef = this.fServices.get(key);
		if (existingServiceDef) this.internalDispose(existingServiceDef);
		this.fServices.set(key, newDef);
		this.fNewQueue.set(key, newDef);
	}
	get(key) {
		return this.internalGet(key);
	}
	getOptional(key) {
		return this.internalGetOptional(key);
	}
	use(provider) {
		provider(this);
	}
	expand(providers, flush = true) {
		const preLockState = this.fLocked;
		const allProviders = Array.isArray(providers) ? providers : [providers];
		try {
			this.fLocked = false;
			for (const provider of allProviders) this.use(provider);
			const newKeys = [...this.fNewQueue.keys()].filter((k) => !this.fSingletonInstances.has(k));
			this.fContainerEvents.callOnExpanded(newKeys);
			if (flush) this.flushQueue();
		} finally {
			this.fLocked = preLockState;
		}
	}
	resolve(classType, method = IOC.InjectMethod.LAZY) {
		const newInstance = new classType();
		this.internalProcessInjects(newInstance, method);
		return newInstance;
	}
	getAllServices() {
		return this.servicesKeys.map((k) => this.get(k));
	}
	unlock() {
		this.fLocked = false;
	}
	lock() {
		this.fLocked = true;
	}
	flushQueue() {
		if (this.fNewQueue.size === 0) return;
		const values = [...this.fNewQueue.values()];
		for (const def of values) {
			if (def.type !== IOC.ServiceFactoryType.CLASS_SINGLETON) continue;
			initializeDecorators(this.internalResolve(def), this);
		}
		this.fNewQueue.clear();
	}
	internalGet(key, parent) {
		const serviceDef = this.fServices.get(key);
		if (!serviceDef) throw new Error(`Unresolved dependency for [${this.getKeyDescription(key)}]`);
		return this.internalResolve(serviceDef);
	}
	internalGetOptional(key) {
		const serviceDef = this.fServices.get(key);
		if (!serviceDef) return null;
		return this.internalResolve(serviceDef);
	}
	internalResolve(serviceDef) {
		switch (serviceDef.type) {
			case IOC.ServiceFactoryType.INSTANCE: return serviceDef.serviceValue;
			case IOC.ServiceFactoryType.CLASS_SINGLETON:
				if (!this.fSingletonInstances.has(serviceDef.serviceKey)) {
					const constructor = serviceDef.serviceValue;
					const instance = new constructor();
					this.fSingletonInstances.set(serviceDef.serviceKey, instance);
					this.internalProcessInjects(instance, this.fInjectMethod);
					return instance;
				}
				return this.fSingletonInstances.get(serviceDef.serviceKey);
			case IOC.ServiceFactoryType.CLASS: {
				const constructor = serviceDef.serviceValue;
				const instance = new constructor();
				this.internalProcessInjects(instance, this.fInjectMethod);
				return instance;
			}
			default: throw new Error(`Container - invalid factory type: ${serviceDef.type}`);
		}
	}
	internalProcessInjects(instance, method) {
		if (method === IOC.InjectMethod.LAZY) {
			IOCEngine.injectDeps(this, instance, IOC.InjectMethod.LAZY);
			return;
		}
		const processQueue = [];
		const elementSet = /* @__PURE__ */ new Set();
		const toProcessElements = [];
		processQueue.push(instance);
		toProcessElements.push(instance);
		while (processQueue.length > 0) {
			const element = processQueue.pop();
			const deps = IOCEngine.getDeps(element);
			for (const inj of deps) if (!elementSet.has(inj.dependency)) {
				const isOptional = inj.type === IOC.DependencyType.OPTIONAL;
				const childInstance = isOptional ? this.internalGetOptional(inj.dependency) : this.internalGet(inj.dependency, instance);
				elementSet.add(inj.dependency);
				if (!isOptional) {
					processQueue.push(childInstance);
					toProcessElements.push(childInstance);
				}
			}
		}
		for (const el of toProcessElements) IOCEngine.injectDeps(this, el, IOC.InjectMethod.STATIC);
	}
	internalDispose(def) {
		switch (def.type) {
			case IOC.ServiceFactoryType.INSTANCE:
				destroyDecorators(def.serviceValue, this);
				break;
			case IOC.ServiceFactoryType.CLASS_SINGLETON: {
				const existingInstance = this.fSingletonInstances.get(def.serviceKey);
				if (existingInstance) {
					destroyDecorators(existingInstance, this);
					this.fSingletonInstances.delete(def.serviceKey);
				}
				break;
			}
			case IOC.ServiceFactoryType.CLASS: break;
			default: throw new Error(`Container::internalDispose() - invalid def type: ${def.type}`);
		}
	}
	getKeyDescription(key) {
		if (typeof key === "symbol") return key.description;
		else if (typeof key === "function") return key.name;
		else if (typeof key === "object") return key.constructor?.name ?? "Unknown object";
		return "Unknown";
	}
};
let IOC;
(function(_IOC) {
	_IOC.ServiceFactoryType = /* @__PURE__ */ function(ServiceFactoryType) {
		ServiceFactoryType["CLASS"] = "CLASS";
		ServiceFactoryType["CLASS_SINGLETON"] = "CLASS_SINGLETON";
		ServiceFactoryType["INSTANCE"] = "INSTANCE";
		return ServiceFactoryType;
	}({});
	_IOC.InjectMethod = /* @__PURE__ */ function(InjectMethod) {
		InjectMethod["LAZY"] = "LAZY";
		InjectMethod["STATIC"] = "STATIC";
		return InjectMethod;
	}({});
	_IOC.DependencyType = /* @__PURE__ */ function(DependencyType) {
		DependencyType[DependencyType["STANDARD"] = 0] = "STANDARD";
		DependencyType[DependencyType["OPTIONAL"] = 1] = "OPTIONAL";
		return DependencyType;
	}({});
})(IOC || (IOC = {}));
const classMap = /* @__PURE__ */ new Map();
globalThis.__IOCClassMap = globalThis.__IOCClassMap ?? classMap;
const ROOT_PROTO = Object.getPrototypeOf({});
function getMapper() {
	return globalThis.__IOCClassMap;
}
function registerInject(prototype, propertyName, dependency, type) {
	let entry = getMapper().get(prototype);
	if (!entry) {
		entry = { deps: [] };
		getMapper().set(prototype, entry);
	}
	const newDep = {
		propertyName,
		dependency,
		type
	};
	entry.deps.push(newDep);
}
function getEntryForClass(classType) {
	const entry = getMapper().get(classType.prototype);
	return entry === void 0 ? null : entry;
}
function getDeps(instance) {
	const prototype = Object.getPrototypeOf(instance);
	if (!prototype) return [];
	const entry = getMapper().get(prototype);
	return entry !== void 0 && entry.deps !== void 0 ? entry.deps : [];
}
function injectDeps(container, instance, method) {
	let prototype = Object.getPrototypeOf(instance);
	if (!prototype) return;
	do {
		const entry = getMapper().get(prototype);
		if (entry) for (const iter of entry.deps) {
			const propertyName = iter.propertyName;
			const dependency = iter.dependency;
			const type = iter.type;
			if (Object.prototype.hasOwnProperty.call(instance, propertyName) && instance[propertyName] !== void 0) continue;
			if (type === IOC.DependencyType.OPTIONAL) {
				Object.defineProperty(instance, propertyName, { get: function() {
					return container.getOptional(dependency);
				} });
				continue;
			}
			switch (method) {
				case IOC.InjectMethod.LAZY:
					Object.defineProperty(instance, propertyName, { get: function() {
						return container.get(dependency);
					} });
					break;
				case IOC.InjectMethod.STATIC:
					instance[propertyName] = container.get(dependency);
					break;
				default: throw new Error(`IOCEngine.injectDeps() - invalid inject method ${method}`);
			}
		}
		prototype = Object.getPrototypeOf(prototype);
	} while (prototype && prototype !== ROOT_PROTO);
}
const IOCEngine = {
	registerInject,
	getEntryForClass,
	injectDeps,
	getDeps
};
function Inject(key) {
	return (target, propertyName) => {
		IOCEngine.registerInject(target, propertyName, key, IOC.DependencyType.STANDARD);
	};
}
function InjectOptional(key) {
	return (target, propertyName) => {
		IOCEngine.registerInject(target, propertyName, key, IOC.DependencyType.OPTIONAL);
	};
}
var Logger = class {};
function __decorate$1(decorators, target, key, desc) {
	var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
	if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
	else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
	return c > 3 && r && Object.defineProperty(target, key, r), r;
}
var RuntimeConfig = class {
	fRuntimeConfig;
	get runtimeConfig() {
		return this.fRuntimeConfig;
	}
	set runtimeConfig(value) {
		this.fRuntimeConfig = value;
	}
};
var HttpError = class HttpError extends Error {
	status;
	constructor(status, message) {
		super();
		Object.setPrototypeOf(this, HttpError.prototype);
		if (status) this.status = status;
		if (message) this.message = message;
		this.stack = (/* @__PURE__ */ new Error()).stack;
	}
};
var NotFoundError = class NotFoundError extends HttpError {
	name = "NotFoundError";
	constructor(message) {
		super(404);
		Object.setPrototypeOf(this, NotFoundError.prototype);
		if (message) this.message = message;
	}
};
var ErrorHandlerProvider = class {};
var BadRequestError = class BadRequestError extends HttpError {
	name = "BadRequestError";
	constructor(message, errors) {
		super(400);
		Object.setPrototypeOf(this, BadRequestError.prototype);
		if (message) this.message = message;
		if (errors) this.errors = errors;
	}
};
const DANGEROUS_PROPERTIES = Object.freeze([
	"__proto__",
	"constructor",
	"prototype"
]);
function isSafeProperty(key) {
	return !DANGEROUS_PROPERTIES.includes(key);
}
function secureReviver(key, value) {
	if (!isSafeProperty(key)) return;
	return value;
}
function safeJsonParse(text) {
	return JSON.parse(text, secureReviver);
}
function safeAssign(target, source) {
	for (const key of Object.keys(source)) if (isSafeProperty(key) && Object.prototype.hasOwnProperty.call(source, key)) target[key] = source[key];
}
async function resolveRequestBody(event) {
	const text = await event.request.clone().text();
	if (!text) return;
	try {
		return safeJsonParse(text);
	} catch {
		throw new BadRequestError("Invalid JSON body");
	}
}
function getRequestHeader(header, event) {
	return event.request.headers.get(header);
}
function getRequestHeaders(event) {
	return event.request.headers;
}
function resolveQueryParam(name, event) {
	return new URL(event.request.url).searchParams.get(name);
}
function resolveQueryParams(event) {
	const url = new URL(event.request.url);
	const params = {};
	for (const [key, value] of url.searchParams) params[key] = value;
	return params;
}
function resolveRouterParam(param, event) {
	return event.params?.[param] ?? null;
}
var MetadataResolver = class {
	resolveUrl(params) {
		const { instance, propertyName, path: rawPath } = params;
		const metadata = instance.__metadata;
		const url = `${(metadata?.__controller?.path ?? "").replace(/\/$/, "")}/${rawPath.replace(/^\//, "")}`;
		metadata.__methods[propertyName].url = url;
		return url;
	}
	resolveMethod(ctx, propertyName) {
		return ctx.__metadata.__methods[propertyName];
	}
	async resolveArgs(args, event) {
		args.sort((a, b) => a.idx - b.idx);
		const resolvedArgs = args.map(async (arg) => ({
			...arg,
			resolved: await this.resolveArg(arg, event)
		}));
		return await Promise.all(resolvedArgs);
	}
	resolveArg(arg, event) {
		switch (arg.type) {
			case "param": return resolveRouterParam(arg?.data?.name ?? "", event);
			case "body": return resolveRequestBody(event);
			case "multipart-form-data": return null;
			case "query-param": return resolveQueryParam(arg?.data?.name ?? "", event);
			case "query-params": return resolveQueryParams(event);
			case "header": return getRequestHeader(arg.data?.name ?? "", event);
			case "headers": return getRequestHeaders(event);
			case "request": return event.request;
			case "response": return event.response;
			case "custom": return arg.resolver?.(event);
			case "session": return null;
			default: throw new Error(`Unknown argument type: ${arg.type}`);
		}
	}
	resolveMiddlewares(ctx, propertyName) {
		return (ctx?.__metadata?.__middlewares?.filter((m) => m.target === "__global__" || m.target === propertyName) ?? []).sort((a) => a.target === "__global__" ? -1 : 1);
	}
};
var GlobalMiddlewareRegistry = class {
	fMiddlewares = /* @__PURE__ */ new Set();
	get middlewares() {
		return [...this.fMiddlewares.values()].map((m) => ({
			...m.opts,
			target: "__global__",
			middleware: m.middleware
		}));
	}
	registerGlobalMiddleware(middleware, opts) {
		this.fMiddlewares.add({
			middleware,
			opts
		});
	}
};
var RequestContext = class {
	fStorage;
	constructor() {
		this.fStorage = new AsyncLocalStorage();
	}
	async run(fn) {
		const context = /* @__PURE__ */ new Map();
		return this.fStorage.run(context, fn);
	}
	set(key, value) {
		const context = this.fStorage.getStore();
		if (!context) throw new Error("RequestContext.set() called outside of request context. The context is automatically initialized by RequestHandler.");
		context.set(key, value);
	}
	get(key) {
		const context = this.fStorage.getStore();
		if (!context) throw new Error("RequestContext.get() called outside of request context. The context is automatically initialized by RequestHandler.");
		return context.get(key);
	}
	getOrDefault(key, defaultValue) {
		const value = this.get(key);
		return value === void 0 ? defaultValue : value;
	}
	has(key) {
		const context = this.fStorage.getStore();
		if (!context) return false;
		return context.has(key);
	}
	keys() {
		const context = this.fStorage.getStore();
		if (!context) return [];
		return [...context.keys()];
	}
	getAll() {
		const context = this.fStorage.getStore();
		if (!context) return /* @__PURE__ */ new Map();
		return new Map(context);
	}
};
function __decorate(decorators, target, key, desc) {
	var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
	if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
	else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
	return c > 3 && r && Object.defineProperty(target, key, r), r;
}
var RequestHandler = class {
	gMetadataResolver;
	gContainer;
	gGlobalMiddlewareRegistry;
	prepareHandler(params) {
		const { instance, propertyName } = params;
		const prototype = Object.getPrototypeOf(instance);
		const method = this.gMetadataResolver.resolveMethod(prototype, propertyName);
		const middlewares = this.gMetadataResolver.resolveMiddlewares(prototype, propertyName);
		const globalMiddlewares = this.gGlobalMiddlewareRegistry.middlewares;
		const resolvedMiddlewares = [...middlewares, ...globalMiddlewares].filter((m, index, self) => self.findIndex((t) => t.middleware === m.middleware) === index).map((m) => ({
			...m,
			middleware: this.gContainer.resolve(m.middleware)
		}));
		const beforeMiddlewares = resolvedMiddlewares.filter((m) => !!m.middleware.onRequest);
		const afterMiddlewares = resolvedMiddlewares.filter((m) => !!m.middleware.onResponse);
		beforeMiddlewares.sort((a, b) => (a?.priority ?? 999) - (b?.priority ?? 999));
		afterMiddlewares.sort((a, b) => (a?.priority ?? 999) - (b?.priority ?? 999));
		return {
			instance,
			propertyName,
			args: method.args,
			middlewares: {
				beforeMiddlewares,
				afterMiddlewares
			},
			actions: method.actions
		};
	}
	async handlePreflight(request) {
		return this.runWithContext(async () => {
			return this.internalHandlePreflight(request);
		});
	}
	async internalHandlePreflight(request) {
		try {
			let fakeResponse = this.createInitialResponse(request);
			const globalMiddlewares = this.gGlobalMiddlewareRegistry.middlewares;
			const resolvedMiddlewares = this.resolveMiddlewares(globalMiddlewares);
			const result = await this.executeMiddlewares(resolvedMiddlewares, {
				request,
				response: fakeResponse,
				methodArgs: [],
				handlerResponse: void 0,
				executeRequest: true,
				executeResponse: true
			});
			if (result.earlyReturn) return result.earlyReturn;
			return this.createFinalResponse(result.response, null, 204, "No Content");
		} catch (error) {
			return await this.handleError(error);
		}
	}
	async handleRequest(request, route) {
		return this.runWithContext(async () => {
			return this.internalHandleRequest(request, route);
		});
	}
	async internalHandleRequest(request, route) {
		try {
			const { instance, propertyName, actions = [], args = [], middlewares = {
				beforeMiddlewares: [],
				afterMiddlewares: []
			} } = route.data;
			let fakeResponse = this.createInitialResponse(request);
			const resolvedArgs = args.length > 0 ? await this.gMetadataResolver.resolveArgs(args, {
				...route,
				request,
				response: fakeResponse
			}) : [];
			const beforeResult = await this.executeMiddlewares(middlewares.beforeMiddlewares, {
				request,
				response: fakeResponse,
				methodArgs: resolvedArgs,
				handlerResponse: void 0,
				executeRequest: true,
				executeResponse: false
			});
			if (beforeResult.earlyReturn) return beforeResult.earlyReturn;
			fakeResponse = beforeResult.response;
			for (const action of actions) {
				const actionResponse = action.handler(request, fakeResponse);
				if (actionResponse != null) fakeResponse = this.processOverrideResponse(actionResponse, fakeResponse);
			}
			let handlerResponse = instance[propertyName].call(instance, ...resolvedArgs?.map((a) => a.resolved) ?? []);
			if (handlerResponse instanceof Promise) handlerResponse = await handlerResponse;
			const afterResult = await this.executeMiddlewares(middlewares.afterMiddlewares, {
				request,
				response: fakeResponse,
				methodArgs: resolvedArgs,
				handlerResponse,
				executeRequest: false,
				executeResponse: true
			});
			if (afterResult.earlyReturn) return afterResult.earlyReturn;
			fakeResponse = afterResult.response;
			if (handlerResponse instanceof Response) return handlerResponse;
			return this.createFinalResponse(fakeResponse, handlerResponse, 200, "OK");
		} catch (error) {
			return await this.handleError(error);
		}
	}
	async runWithContext(fn) {
		const requestContext = this.gContainer.getOptional(RequestContext);
		if (requestContext) return requestContext.run(fn);
		return fn();
	}
	createInitialResponse(request) {
		return new NodeResponse(void 0, { headers: { "Content-Type": request.headers.get("Content-Type") ?? "application/json" } });
	}
	async handleError(error) {
		return this.gContainer.get(ErrorHandlerProvider).handleError(error);
	}
	resolveMiddlewares(middlewares) {
		return middlewares.map((m) => ({
			...m,
			middleware: this.gContainer.resolve(m.middleware)
		}));
	}
	async executeMiddlewareRequest(hook, request, response, methodArgs) {
		const hookResponse = await hook.middleware.onRequest?.(request, response, {
			middlewareArgs: hook.args,
			methodArgs
		});
		if (hookResponse instanceof Response) return hookResponse;
		if (hookResponse !== null && hookResponse !== void 0) return this.processOverrideResponse(hookResponse, response);
		return null;
	}
	async executeMiddlewareResponse(hook, request, response, payload) {
		const hookResponse = await hook.middleware.onResponse?.(request, response, payload);
		if (hookResponse instanceof Response) return hookResponse;
		if (hookResponse !== null && hookResponse !== void 0) return this.processOverrideResponse(hookResponse, response);
		return null;
	}
	async executeMiddlewares(middlewares, options) {
		const { request, response, methodArgs, handlerResponse, executeRequest, executeResponse } = options;
		let currentResponse = response;
		for await (const hook of middlewares) try {
			if (executeRequest) {
				const requestResult = await this.executeMiddlewareRequest(hook, request, currentResponse, methodArgs);
				if (requestResult instanceof Response) return {
					earlyReturn: requestResult,
					response: currentResponse
				};
				if (requestResult !== null && requestResult !== currentResponse) currentResponse = requestResult;
			}
			if (executeResponse) {
				const responseResult = await this.executeMiddlewareResponse(hook, request, currentResponse, handlerResponse);
				if (responseResult instanceof Response) return {
					earlyReturn: responseResult,
					response: currentResponse
				};
				if (responseResult !== null && responseResult !== currentResponse) currentResponse = responseResult;
			}
		} catch (error) {
			return {
				earlyReturn: await this.handleError(error),
				response: currentResponse
			};
		}
		return { response: currentResponse };
	}
	createFinalResponse(fakeResponse, handlerResponse, defaultStatus, defaultStatusText) {
		const body = ("body" in fakeResponse && fakeResponse.body != null ? fakeResponse.body : null) ?? JSON.stringify(handlerResponse);
		return new Response(body, {
			status: fakeResponse.status ?? defaultStatus,
			statusText: fakeResponse.statusText ?? defaultStatusText,
			headers: fakeResponse.headers
		});
	}
	processOverrideResponse(response, base) {
		let fakeResponse = base ?? new NodeResponse();
		if (response != null && response instanceof NodeResponse) return response;
		else if (response !== null) {
			const responseInit = response;
			fakeResponse = new NodeResponse(void 0, {
				status: responseInit?.status ?? fakeResponse.status,
				headers: responseInit?.headers ?? fakeResponse.headers,
				statusText: responseInit?.statusText ?? fakeResponse.statusText
			});
		}
		return fakeResponse;
	}
};
__decorate([Inject(MetadataResolver)], RequestHandler.prototype, "gMetadataResolver", void 0);
__decorate([Inject(Container)], RequestHandler.prototype, "gContainer", void 0);
__decorate([Inject(GlobalMiddlewareRegistry)], RequestHandler.prototype, "gGlobalMiddlewareRegistry", void 0);
var RouterAfterInitHook = class {};
var RouterBeforeInitHook = class {};
var HooksService = class {
	fLastId = 0;
	fHandlers = /* @__PURE__ */ new Map();
	on(type, callback) {
		let handlersOfType = this.fHandlers.get(type);
		if (!handlersOfType) {
			handlersOfType = [];
			this.fHandlers.set(type, handlersOfType);
		}
		const genId = this.fLastId++;
		const handler = {
			callback,
			id: genId
		};
		handlersOfType.push(handler);
		return {
			__id: genId,
			__type: type
		};
	}
	waitFor(type, timeout = 10 * 1e3) {
		return new Promise((resolve, reject) => {
			let waitTimeout;
			const eventId = this.on(type, (data) => {
				this.off(eventId);
				resolve(data);
				if (waitTimeout) clearTimeout(waitTimeout);
			});
			if (timeout !== null) waitTimeout = setTimeout(() => {
				this.off(eventId);
				reject(/* @__PURE__ */ new Error(`Waiting for event timeout - ${type.name}`));
			}, timeout);
		});
	}
	off(eventId) {
		const type = eventId.__type;
		const handlersOfType = this.fHandlers.get(type);
		if (!handlersOfType) throw new Error("Trying to unbind event that was not bound.");
		const index = handlersOfType.findIndex((handler) => handler.id === eventId.__id);
		if (index === -1) throw new Error("Trying to unbind event that was not bound.");
		handlersOfType.splice(index, 1);
	}
	async trigger(type, data) {
		const handlersOfType = this.fHandlers.get(type);
		if (!handlersOfType) return 0;
		const toProcessHandlers = [...handlersOfType];
		const promises = toProcessHandlers.map((handler) => {
			const instance = this.objectToClass(type, data);
			const result = handler.callback(instance);
			return result instanceof Promise ? result : Promise.resolve();
		});
		await Promise.all(promises);
		return toProcessHandlers.length;
	}
	objectToClass(ClassConstructor, data) {
		const instance = new ClassConstructor();
		if (data) safeAssign(instance, data);
		return instance;
	}
};
var Router = class {
	gHooksService;
	fRouterContext;
	addRoute(route) {
		if (!this.fRouterContext) throw new Error("Router not initialized. Please call init() before adding routes.");
		addRoute(this.fRouterContext, route.method.toUpperCase(), route.path, route.handler);
	}
	initialize() {
		this.gHooksService.trigger(RouterBeforeInitHook);
		this.fRouterContext = createRouter();
		this.gHooksService.trigger(RouterAfterInitHook);
	}
	resolve(route) {
		let url = route.path;
		try {
			url = new URL(route.path).pathname;
		} catch {}
		return findRoute(this.fRouterContext, route.method.toUpperCase(), url);
	}
};
__decorate([Inject(HooksService)], Router.prototype, "gHooksService", void 0);
const mime = { getType(ext) {
	return {
		".html": "text/html",
		".css": "text/css",
		".js": "application/javascript",
		".json": "application/json",
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".gif": "image/gif",
		".svg": "image/svg+xml",
		".ico": "image/x-icon"
	}[ext] || null;
} };
var StaticRequestHandler = class {
	fOptions;
	initialize(options) {
		this.fOptions = options;
	}
	async handleRequest(request) {
		const dirs = this.fOptions?.dirs ?? [];
		if (!dirs) return;
		if (request.method !== "GET") return;
		let relativePath = normalize(new URL(request.url).pathname);
		for (const dir of dirs) relativePath = relativePath.replace(dir, "");
		for (const dir of dirs) {
			const fullPath = join(process.cwd(), dir, relativePath);
			try {
				const stats = await stat(fullPath);
				if (stats.isDirectory()) continue;
				if (stats.isFile()) return this.serveFile(fullPath, stats);
			} catch {
				continue;
			}
		}
	}
	async serveFile(path, stats) {
		const headers = new Headers();
		const ext = extname(path).toLowerCase();
		const contentType = mime.getType(ext) || "application/octet-stream";
		headers.set("Content-Type", contentType);
		headers.set("Content-Length", stats.size.toString());
		if (this.fOptions?.maxAge && this.fOptions.maxAge > 0) {
			const directives = ["public", `max-age=${this.fOptions.maxAge}`];
			if (this.fOptions?.immutable) directives.push("immutable");
			headers.set("Cache-Control", directives.join(", "));
		}
		if (this.fOptions?.etag) headers.set("ETag", `W/"${stats.size}-${stats.mtime.getTime()}"`);
		const stream = createReadStream(path);
		return new Response(stream, { headers });
	}
};
var HttpServer = class {
	gContainer;
	gRouter;
	gRequestHandler;
	gStaticRequestHandler;
	fServer;
	fPlugins = [];
	addPlugin(plugin) {
		this.fPlugins.push(plugin);
	}
	async initialize(config) {
		const { port, host } = config.server ?? {};
		this.fServer = serve({
			bun: { error: (error) => {
				return this.gContainer.get(ErrorHandlerProvider).handleError(error);
			} },
			deno: { onError: (error) => {
				return this.gContainer.get(ErrorHandlerProvider).handleError(error);
			} },
			hostname: host,
			reusePort: true,
			port,
			fetch: this.handleRequest.bind(this),
			plugins: this.fPlugins,
			manual: true
		});
	}
	async listen() {
		await this.fServer.serve();
		await this.fServer.ready();
	}
	async handleRequest(request) {
		try {
			const route = this.gRouter.resolve({
				path: request.url,
				method: request.method
			});
			if (!route && request.method === "OPTIONS") return this.gRequestHandler.handlePreflight(request);
			if (!route) {
				const response = await this.gStaticRequestHandler.handleRequest(request);
				if (response) return response;
				else throw new NotFoundError("Route not found");
			}
			return this.gRequestHandler.handleRequest(request, route);
		} catch (error) {
			return this.gContainer.get(ErrorHandlerProvider).handleError(error instanceof Error ? error : new Error(String(error)));
		}
	}
};
__decorate([Inject(Container)], HttpServer.prototype, "gContainer", void 0);
__decorate([Inject(Router)], HttpServer.prototype, "gRouter", void 0);
__decorate([Inject(RequestHandler)], HttpServer.prototype, "gRequestHandler", void 0);
__decorate([Inject(StaticRequestHandler)], HttpServer.prototype, "gStaticRequestHandler", void 0);
var PluginsRegistry = class {
	gContainer;
	fPlugins = /* @__PURE__ */ new Map();
	register(plugin, options) {
		const instance = this.gContainer.resolve(plugin);
		if (!instance.name) throw new Error("Plugin must have a name");
		this.fPlugins.set(instance.name, {
			instance,
			options
		});
	}
	get plugins() {
		return [...this.fPlugins.values()].map((plugin) => plugin.instance);
	}
	async init(app) {
		for (const { instance, options } of this.fPlugins.values()) await instance.use(app, options);
	}
};
__decorate([Inject(Container)], PluginsRegistry.prototype, "gContainer", void 0);
var App = class {
	gRouter;
	gPluginsRegistry;
	gHttpServer;
	gStaticRequestHandler;
	gRuntimeConfig;
	fIsInitialized = false;
	fInternalContainer;
	fConfig;
	get container() {
		return this.fInternalContainer;
	}
	set container(container) {
		this.fInternalContainer = container;
	}
	get config() {
		return {
			...this.fConfig,
			runtime: void 0
		};
	}
	async init(cfg) {
		this.fConfig = cfg;
		await this.resolvePlugins();
		await this.gHttpServer.initialize(this.fConfig);
		if (this.fConfig.server?.static) this.gStaticRequestHandler.initialize(this.fConfig.server?.static);
		if (this.fConfig.runtime) this.gRuntimeConfig.runtimeConfig = this.fConfig.runtime;
		this.gRouter.initialize();
	}
	addPlugin(plugin, options) {
		this.gPluginsRegistry.register(plugin, options);
	}
	async listen() {
		if (this.fIsInitialized) throw new Error("App is already initialized");
		initializeContainer(this.container);
		await this.gHttpServer.listen();
		this.fIsInitialized = true;
	}
	async fetch(request) {
		return this.gHttpServer.handleRequest(request);
	}
	async resolvePlugins() {
		await this.gPluginsRegistry.init(this);
	}
};
__decorate([Inject(Router)], App.prototype, "gRouter", void 0);
__decorate([Inject(PluginsRegistry)], App.prototype, "gPluginsRegistry", void 0);
__decorate([Inject(HttpServer)], App.prototype, "gHttpServer", void 0);
__decorate([Inject(StaticRequestHandler)], App.prototype, "gStaticRequestHandler", void 0);
__decorate([Inject(RuntimeConfig)], App.prototype, "gRuntimeConfig", void 0);
var InternalServerError = class InternalServerError extends HttpError {
	name = "InternalServerError";
	constructor(message) {
		super(500);
		Object.setPrototypeOf(this, InternalServerError.prototype);
		if (message) this.message = message;
	}
};
var DefaultErrorHandlerProvider = class extends ErrorHandlerProvider {
	gLogger;
	handleError(error) {
		const _internalError = new InternalServerError(error?.message ?? "Internal server error");
		const status = error?.status ?? 500;
		if (error instanceof HttpError) return new NodeResponse(JSON.stringify({ ...error }, void 0, 2), { status });
		this.gLogger.error(error);
		return new NodeResponse(JSON.stringify({ ...error?.cause ?? _internalError }, void 0, 2), { status });
	}
};
__decorate([Inject(Logger)], DefaultErrorHandlerProvider.prototype, "gLogger", void 0);
var ValidationProvider = class {};
process.env.NODE_ENV, process.env.NODE_ENV, process.cwd();
var ValidationMiddleware = class {
	gLogger;
	gValidationProvider;
	async onRequest(request, response, args) {
		if (!this.gValidationProvider) {
			this.gLogger?.warn("ValidationMiddleware::ValidationProvider", "Validation provider is not registered");
			return;
		}
		const validators = args.methodArgs?.filter((arg) => arg.validate && arg.validationSchema) ?? [];
		for (const validator of validators) {
			const result = await this.gValidationProvider.validate(validator.validationSchema, validator.resolved);
			if (result.issues?.length) throw new BadRequestError(`Validation error - ${validator.type}`, result.issues);
		}
	}
};
__decorate([InjectOptional(Logger)], ValidationMiddleware.prototype, "gLogger", void 0);
__decorate([InjectOptional(ValidationProvider)], ValidationMiddleware.prototype, "gValidationProvider", void 0);
function createMetadataCtx() {
	return {
		__controller: { path: "" },
		__middlewares: [],
		__methods: {}
	};
}
function createMetadataMethod() {
	return {
		req: null,
		res: null,
		url: null,
		method: null,
		args: [],
		actions: [],
		meta: {}
	};
}
function initializeMetadataMethod(target, propertyName) {
	if (!target.__metadata.__methods[propertyName]) target.__metadata.__methods[propertyName] = createMetadataMethod();
	return target.__metadata.__methods[propertyName];
}
function initializeMetadata(target) {
	if (!target.__metadata) target.__metadata = createMetadataCtx();
	if (!target.__metadata.__methods) target.__metadata.__methods = {};
	if (!target.__metadata.__middlewares) target.__metadata.__middlewares = [];
	return target.__metadata;
}
var ConnectDecorator = class extends BaseDecorator {
	gRouter;
	gRequestHandler;
	gMetadataResolver;
	created() {
		initializeMetadata(this.prototype);
		const method = initializeMetadataMethod(this.prototype, this.propertyName);
		method.method = "CONNECT";
		this.options.path = this.gMetadataResolver.resolveUrl({
			instance: this.instance,
			path: this.options.path,
			propertyName: this.propertyName
		});
		this.gRouter.addRoute({
			path: this.options.path,
			method: "CONNECT",
			handler: this.gRequestHandler.prepareHandler({
				instance: this.instance,
				propertyName: this.propertyName
			})
		});
	}
};
__decorate([Inject(Router)], ConnectDecorator.prototype, "gRouter", void 0);
__decorate([Inject(RequestHandler)], ConnectDecorator.prototype, "gRequestHandler", void 0);
__decorate([Inject(MetadataResolver)], ConnectDecorator.prototype, "gMetadataResolver", void 0);
function Controller(path) {
	return function internalDecorator(target) {
		const meta = initializeMetadata(target.prototype);
		meta.__controller = {
			...meta?.__controller,
			path
		};
	};
}
var DeleteDecorator = class extends BaseDecorator {
	gRouter;
	gRequestHandler;
	gMetadataResolver;
	created() {
		initializeMetadata(this.prototype);
		const method = initializeMetadataMethod(this.prototype, this.propertyName);
		method.method = "DELETE";
		this.options.path = this.gMetadataResolver.resolveUrl({
			instance: this.instance,
			path: this.options.path,
			propertyName: this.propertyName
		});
		this.gRouter.addRoute({
			path: this.options.path,
			method: "DELETE",
			handler: this.gRequestHandler.prepareHandler({
				instance: this.instance,
				propertyName: this.propertyName
			})
		});
	}
};
__decorate([Inject(Router)], DeleteDecorator.prototype, "gRouter", void 0);
__decorate([Inject(RequestHandler)], DeleteDecorator.prototype, "gRequestHandler", void 0);
__decorate([Inject(MetadataResolver)], DeleteDecorator.prototype, "gMetadataResolver", void 0);
var GetDecorator = class extends BaseDecorator {
	gRouter;
	gRequestHandler;
	gMetadataResolver;
	created() {
		initializeMetadata(this.prototype);
		const method = initializeMetadataMethod(this.prototype, this.propertyName);
		method.method = "GET";
		this.options.path = this.gMetadataResolver.resolveUrl({
			instance: this.instance,
			path: this.options.path,
			propertyName: this.propertyName
		});
		this.gRouter.addRoute({
			path: this.options.path,
			method: "GET",
			handler: this.gRequestHandler.prepareHandler({
				instance: this.instance,
				propertyName: this.propertyName
			})
		});
	}
};
__decorate([Inject(Router)], GetDecorator.prototype, "gRouter", void 0);
__decorate([Inject(RequestHandler)], GetDecorator.prototype, "gRequestHandler", void 0);
__decorate([Inject(MetadataResolver)], GetDecorator.prototype, "gMetadataResolver", void 0);
function Get(path) {
	return createDecorator(GetDecorator, { path });
}
var HeadDecorator = class extends BaseDecorator {
	gRouter;
	gRequestHandler;
	gMetadataResolver;
	created() {
		initializeMetadata(this.prototype);
		const method = initializeMetadataMethod(this.prototype, this.propertyName);
		method.method = "HEAD";
		this.options.path = this.gMetadataResolver.resolveUrl({
			instance: this.instance,
			path: this.options.path,
			propertyName: this.propertyName
		});
		this.gRouter.addRoute({
			path: this.options.path,
			method: "HEAD",
			handler: this.gRequestHandler.prepareHandler({
				instance: this.instance,
				propertyName: this.propertyName
			})
		});
	}
};
__decorate([Inject(Router)], HeadDecorator.prototype, "gRouter", void 0);
__decorate([Inject(RequestHandler)], HeadDecorator.prototype, "gRequestHandler", void 0);
__decorate([Inject(MetadataResolver)], HeadDecorator.prototype, "gMetadataResolver", void 0);
var OptionsDecorator = class extends BaseDecorator {
	gRouter;
	gRequestHandler;
	gMetadataResolver;
	created() {
		initializeMetadata(this.prototype);
		const method = initializeMetadataMethod(this.prototype, this.propertyName);
		method.method = "OPTIONS";
		this.options.path = this.gMetadataResolver.resolveUrl({
			instance: this.instance,
			path: this.options.path,
			propertyName: this.propertyName
		});
		this.gRouter.addRoute({
			path: this.options.path,
			method: "OPTIONS",
			handler: this.gRequestHandler.prepareHandler({
				instance: this.instance,
				propertyName: this.propertyName
			})
		});
	}
};
__decorate([Inject(Router)], OptionsDecorator.prototype, "gRouter", void 0);
__decorate([Inject(RequestHandler)], OptionsDecorator.prototype, "gRequestHandler", void 0);
__decorate([Inject(MetadataResolver)], OptionsDecorator.prototype, "gMetadataResolver", void 0);
var ParamDecorator = class extends BaseDecorator {
	gMetadataResolver;
	created() {
		initializeMetadata(this.prototype);
		initializeMetadataMethod(this.prototype, this.propertyName).args.push({
			idx: this.propertyIndex,
			type: "param",
			data: { name: this.options.name }
		});
	}
};
__decorate([Inject(MetadataResolver)], ParamDecorator.prototype, "gMetadataResolver", void 0);
var PatchDecorator = class extends BaseDecorator {
	gRouter;
	gRequestHandler;
	gMetadataResolver;
	created() {
		initializeMetadata(this.prototype);
		const method = initializeMetadataMethod(this.prototype, this.propertyName);
		method.method = "PATCH";
		this.options.path = this.gMetadataResolver.resolveUrl({
			instance: this.instance,
			path: this.options.path,
			propertyName: this.propertyName
		});
		this.gRouter.addRoute({
			path: this.options.path,
			method: "PATCH",
			handler: this.gRequestHandler.prepareHandler({
				instance: this.instance,
				propertyName: this.propertyName
			})
		});
	}
};
__decorate([Inject(Router)], PatchDecorator.prototype, "gRouter", void 0);
__decorate([Inject(RequestHandler)], PatchDecorator.prototype, "gRequestHandler", void 0);
__decorate([Inject(MetadataResolver)], PatchDecorator.prototype, "gMetadataResolver", void 0);
var PostDecorator = class extends BaseDecorator {
	gRouter;
	gMetadataResolver;
	gRequestHandler;
	created() {
		initializeMetadata(this.prototype);
		const method = initializeMetadataMethod(this.prototype, this.propertyName);
		method.method = "POST";
		this.options.path = this.gMetadataResolver.resolveUrl({
			instance: this.instance,
			path: this.options.path,
			propertyName: this.propertyName
		});
		this.gRouter.addRoute({
			path: this.options.path,
			method: "POST",
			handler: this.gRequestHandler.prepareHandler({
				instance: this.instance,
				propertyName: this.propertyName
			})
		});
	}
};
__decorate([Inject(Router)], PostDecorator.prototype, "gRouter", void 0);
__decorate([Inject(MetadataResolver)], PostDecorator.prototype, "gMetadataResolver", void 0);
__decorate([Inject(RequestHandler)], PostDecorator.prototype, "gRequestHandler", void 0);
var PutDecorator = class extends BaseDecorator {
	gRouter;
	gRequestHandler;
	gMetadataResolver;
	created() {
		initializeMetadata(this.prototype);
		const method = initializeMetadataMethod(this.prototype, this.propertyName);
		method.method = "PUT";
		this.options.path = this.gMetadataResolver.resolveUrl({
			instance: this.instance,
			path: this.options.path,
			propertyName: this.propertyName
		});
		this.gRouter.addRoute({
			path: this.options.path,
			method: "PUT",
			handler: this.gRequestHandler.prepareHandler({
				instance: this.instance,
				propertyName: this.propertyName
			})
		});
	}
};
__decorate([Inject(Router)], PutDecorator.prototype, "gRouter", void 0);
__decorate([Inject(RequestHandler)], PutDecorator.prototype, "gRequestHandler", void 0);
__decorate([Inject(MetadataResolver)], PutDecorator.prototype, "gMetadataResolver", void 0);
var TraceDecorator = class extends BaseDecorator {
	gRouter;
	gRequestHandler;
	gMetadataResolver;
	created() {
		initializeMetadata(this.prototype);
		const method = initializeMetadataMethod(this.prototype, this.propertyName);
		method.method = "TRACE";
		this.options.path = this.gMetadataResolver.resolveUrl({
			instance: this.instance,
			path: this.options.path,
			propertyName: this.propertyName
		});
		this.gRouter.addRoute({
			path: this.options.path,
			method: "TRACE",
			handler: this.gRequestHandler.prepareHandler({
				instance: this.instance,
				propertyName: this.propertyName
			})
		});
	}
};
__decorate([Inject(Router)], TraceDecorator.prototype, "gRouter", void 0);
__decorate([Inject(RequestHandler)], TraceDecorator.prototype, "gRequestHandler", void 0);
__decorate([Inject(MetadataResolver)], TraceDecorator.prototype, "gMetadataResolver", void 0);
var ListenDecorator = class extends BaseDecorator {
	gHooksService;
	fHook;
	created() {
		this.fHook = this.gHooksService.on(this.options.hookType, (data) => this.instance[this.propertyName](data));
	}
	destroyed() {
		this.gHooksService.off(this.fHook);
	}
};
__decorate([Inject(HooksService)], ListenDecorator.prototype, "gHooksService", void 0);
let FooController = class FooController {
	async index() {
		return { message: "Hello, world!" };
	}
};
__decorate$1([Get("/")], FooController.prototype, "index", null);
FooController = __decorate$1([Controller("/api/foo")], FooController);
export { FooController };
