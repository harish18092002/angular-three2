import { NgtPhysicsStore } from '@angular-three/cannon';
import {
    NgtComponentStore,
    NgtStore,
    NgtUnknownInstance,
    Ref,
    tapEffect,
} from '@angular-three/core';
import { Injectable, NgZone, Optional } from '@angular/core';
import {
    CannonWorkerAPI,
    ConeTwistConstraintOpts,
    ConstraintOptns,
    ConstraintTypes,
    DistanceConstraintOpts,
    HingeConstraintOpts,
    LockConstraintOpts,
    PointToPointConstraintOpts,
} from '@pmndrs/cannon-worker-api';
import { combineLatest, filter } from 'rxjs';
import * as THREE from 'three';

type ConstraintApi = {
    disable: () => void;
    enable: () => void;
};

type HingeConstraintApi = {
    disable: () => void;
    disableMotor: () => void;
    enable: () => void;
    enableMotor: () => void;
    setMotorMaxForce: (value: number) => void;
    setMotorSpeed: (value: number) => void;
};

type NgtConstraintORHingeApi<T extends 'Hinge' | ConstraintTypes> =
    T extends ConstraintTypes ? ConstraintApi : HingeConstraintApi;

export interface NgtConstraintReturn<T extends 'Hinge' | ConstraintTypes> {
    bodyA: Ref<THREE.Object3D>;
    bodyB: Ref<THREE.Object3D>;
    api: NgtConstraintORHingeApi<T>;
}

@Injectable()
export class NgtPhysicConstraint extends NgtComponentStore {
    constructor(
        private zone: NgZone,
        private store: NgtStore,
        @Optional() private physicsStore: NgtPhysicsStore
    ) {
        if (!physicsStore) {
            throw new Error(
                'NgtPhysicConstraint must be used inside of <ngt-physics>'
            );
        }
        super();
    }

    usePointToPointConstraint(
        bodyA: Ref<THREE.Object3D>,
        bodyB: Ref<THREE.Object3D>,
        optns: PointToPointConstraintOpts
    ) {
        return this.useConstraint('PointToPoint', bodyA, bodyB, optns);
    }

    useConeTwistConstraint(
        bodyA: Ref<THREE.Object3D>,
        bodyB: Ref<THREE.Object3D>,
        optns: ConeTwistConstraintOpts
    ) {
        return this.useConstraint('ConeTwist', bodyA, bodyB, optns);
    }

    useDistanceConstraint(
        bodyA: Ref<THREE.Object3D>,
        bodyB: Ref<THREE.Object3D>,
        optns: DistanceConstraintOpts
    ) {
        return this.useConstraint('Distance', bodyA, bodyB, optns);
    }

    useHingeConstraint(
        bodyA: Ref<THREE.Object3D>,
        bodyB: Ref<THREE.Object3D>,
        optns: HingeConstraintOpts
    ) {
        return this.useConstraint('Hinge', bodyA, bodyB, optns);
    }

    useLockConstraint(
        bodyA: Ref<THREE.Object3D>,
        bodyB: Ref<THREE.Object3D>,
        optns: LockConstraintOpts
    ) {
        return this.useConstraint('Lock', bodyA, bodyB, optns);
    }

    private useConstraint<TConstraintType extends 'Hinge' | ConstraintTypes>(
        type: TConstraintType,
        bodyA: Ref<THREE.Object3D>,
        bodyB: Ref<THREE.Object3D>,
        opts: ConstraintOptns | HingeConstraintOpts = {}
    ): NgtConstraintReturn<TConstraintType> {
        return this.zone.runOutsideAngular(() => {
            const physicsStore = this.physicsStore;
            const uuid = THREE.MathUtils.generateUUID();

            requestAnimationFrame(() => {
                this.onCanvasReady(
                    this.store.ready$,
                    () => {
                        this.effect<
                            [CannonWorkerAPI, THREE.Object3D, THREE.Object3D]
                        >(
                            tapEffect(([worker, a, b]) => {
                                worker.addConstraint({
                                    props: [a.uuid, b.uuid, opts],
                                    type,
                                    uuid,
                                });
                                return () => worker.removeConstraint({ uuid });
                            })
                        )(
                            combineLatest([
                                physicsStore.select((s) => s.worker),
                                bodyA.ref$.pipe(
                                    filter(
                                        (ref) =>
                                            (
                                                ref as unknown as NgtUnknownInstance
                                            )['__ngt__'] != undefined
                                    )
                                ),
                                bodyB.ref$.pipe(
                                    filter(
                                        (ref) =>
                                            (
                                                ref as unknown as NgtUnknownInstance
                                            )['__ngt__'] != undefined
                                    )
                                ),
                            ])
                        );
                    },
                    true
                );
            });

            return {
                bodyA,
                bodyB,
                get api() {
                    const worker = physicsStore.get((s) => s.worker);

                    const enableDisable = {
                        disable: () => {
                            requestAnimationFrame(() => {
                                worker.disableConstraint({ uuid });
                            });
                        },
                        enable: () => {
                            requestAnimationFrame(() => {
                                worker.enableConstraint({ uuid });
                            });
                        },
                    } as NgtConstraintORHingeApi<TConstraintType>;

                    if (type === 'Hinge') {
                        return {
                            ...enableDisable,
                            disableMotor: () => {
                                requestAnimationFrame(() => {
                                    worker.disableConstraintMotor({ uuid });
                                });
                            },
                            enableMotor: () => {
                                requestAnimationFrame(() => {
                                    worker.enableConstraintMotor({ uuid });
                                });
                            },
                            setMotorMaxForce: (value: number) => {
                                requestAnimationFrame(() => {
                                    worker.setConstraintMotorMaxForce({
                                        props: value,
                                        uuid,
                                    });
                                });
                            },
                            setMotorSpeed: (value: number) => {
                                requestAnimationFrame(() => {
                                    worker.setConstraintMotorSpeed({
                                        props: value,
                                        uuid,
                                    });
                                });
                            },
                        };
                    }

                    return enableDisable;
                },
            };
        });
    }
}
