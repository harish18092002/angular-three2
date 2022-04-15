import {
    AnyConstructor,
    AnyFunction,
    NGT_INSTANCE_FACTORY,
    NgtInstance,
    NgtInstanceState,
    NgtStore,
    provideInstanceFactory,
    startWithUndefined,
    tapEffect,
} from '@angular-three/core';
import {
    Directive,
    Inject,
    InjectionToken,
    Input,
    NgZone,
    Optional,
    Provider,
    SkipSelf,
} from '@angular/core';
import { BlendFunction, Effect } from 'postprocessing';
import { map, tap } from 'rxjs';
import { NgtEffectComposer } from './effect-composer';

export const NGT_COMMON_EFFECT_FACTORY = new InjectionToken(
    'NgtCommonEffect factory'
);

export function provideCommonEffectFactory<
    TEffect extends Effect,
    TSubEffect extends NgtCommonEffect<TEffect> = NgtCommonEffect<TEffect>
>(
    subEffect: AnyConstructor<TSubEffect>,
    factory?: (sub: TSubEffect) => TEffect
): Provider {
    return [
        provideInstanceFactory<TEffect>(
            subEffect as unknown as AnyConstructor<NgtInstance<TEffect>>,
            factory as AnyFunction
        ),
        { provide: NgtCommonEffect, useExisting: subEffect },
        {
            provide: NGT_COMMON_EFFECT_FACTORY,
            useFactory: (sub: TSubEffect) => {
                return () => factory?.(sub) || sub.instance.value;
            },
            deps: [subEffect],
        },
    ];
}

export interface NgtCommonEffectState<TEffect extends Effect = Effect>
    extends NgtInstanceState<TEffect> {
    blendFunction: BlendFunction;
    opacity?: number;
}

@Directive()
export abstract class NgtCommonEffect<
    TEffect extends Effect = Effect
> extends NgtInstance<TEffect, NgtCommonEffectState<TEffect>> {
    @Input() set opacity(opacity: number) {
        this.set({ opacity });
    }

    @Input() set blendFunction(blendFunction: BlendFunction) {
        this.set({ blendFunction });
    }

    @Input() set options(
        options: ConstructorParameters<AnyConstructor<TEffect>>[0]
    ) {
        this.instanceArgs = options;
    }

    abstract get effectType(): AnyConstructor<TEffect>;

    protected get defaultBlendMode(): BlendFunction {
        return BlendFunction.NORMAL;
    }

    protected readonly effectOptions$ = this.select(
        this.select((s) => s.opacity).pipe(startWithUndefined()),
        this.select((s) => s.blendFunction),
        this.select((s) => s.instance.value),
        this.select((s) => s.instance.value.blendMode),
        () => ({})
    );

    constructor(
        zone: NgZone,
        store: NgtStore,
        @Optional()
        @SkipSelf()
        @Inject(NGT_INSTANCE_FACTORY)
        parentInstanceFactory: AnyFunction,
        @Optional()
        protected effectComposer: NgtEffectComposer
    ) {
        if (!effectComposer) {
            throw new Error(
                `Effects can only be used within <ngt-effect-composer>`
            );
        }

        super({ zone, store, parentInstanceFactory });

        this.set({ blendFunction: this.defaultBlendMode });
    }

    override ngOnInit() {
        this.zone.runOutsideAngular(() => {
            this.onCanvasReady(this.store.ready$, () => {
                this.init(this.ctorParams$);
                if (!this.skipSetEffectOptions) {
                    this.setEffectOptions(this.effectOptions$);
                }
                this.postInit();
            });
        });
        super.ngOnInit();
    }

    /**
     * Sub-classes effects can use this to modify the constructor parameters
     * before calling new this.effectType()
     */
    protected adjustCtorParams(instanceArgs: unknown[]) {
        return instanceArgs;
    }

    /**
     * Sub-classes, if adjust CtorParams, can also use ctorParams$ to ensure ctor is re-invoked
     */
    protected get ctorParams$() {
        return this.instanceArgs$.pipe(map(() => ({})));
    }

    /**
     * Sub-classes can choose to skip default effect options effect
     */
    protected get skipSetEffectOptions() {
        return false;
    }

    /**
     * Sub-classes can choose to run additional logic after init
     * @protected
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    protected postInit() {}

    private readonly init = this.effect<{}>(
        tapEffect(() => {
            const instanceArgs = this.get((s) => s.instanceArgs);
            const effectCtorParams = this.adjustCtorParams(instanceArgs);
            this.prepareInstance(new this.effectType(...effectCtorParams));
        })
    );

    private readonly setEffectOptions = this.effect<{}>(
        tap(() => {
            const { instance: effect, blendFunction, opacity } = this.get();
            const invalidate = this.store.get((s) => s.invalidate);
            if (effect.value) {
                effect.value.blendMode.blendFunction =
                    !blendFunction && blendFunction !== 0
                        ? this.defaultBlendMode
                        : blendFunction;

                if (opacity !== undefined) {
                    effect.value.blendMode.opacity.value = opacity;
                }
            }
            invalidate();
        })
    );
}
