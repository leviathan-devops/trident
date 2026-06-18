import fc from 'fast-check';
import { deepPlanningMachine } from '../../fsm/deep-planning-machine.ts';
import { problemSolvingMachine } from '../../fsm/problem-solving-machine.ts';
import { contextSynthesisMachine } from '../../fsm/context-synthesis-machine.ts';
import { OrchestratorMachineV2 } from '../../fsm/orchestrator-machine-v2.ts';
import { deduplicateFindings } from '../../utils.ts';
import { interpret } from 'xstate';

export function testDeepPlanning(): number {
  let c = 0;
  fc.assert(fc.property(fc.constant('START'), (e) => {
    const s = interpret(deepPlanningMachine).start();
    s.send({ type: e });
    return s.getSnapshot().value === 'layer1';
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.integer({min:3,max:10}), (n) => {
    const s = interpret(deepPlanningMachine).start();
    s.send({type:'START'}); s.send({type:'SUBMIT_LAYER1',count:n});
    const val = s.getSnapshot().value;
    return val !== 'idle';
  }), { numRuns: 50 }); c += 50;
  return c;
}

export function testProblemSolving(): number {
  let c = 0;
  fc.assert(fc.property(fc.constant('SUBMIT_ASSUMPTION'), (e) => {
    const s = interpret(problemSolvingMachine).start();
    s.send({type:e});
    return s.getSnapshot().value === 'assumption';
  }), { numRuns: 50 }); c += 50;
  return c;
}

export function testContextSynthesis(): number {
  let c = 0;
  fc.assert(fc.property(fc.string({minLength:1}), (ctx) => {
    const s = interpret(contextSynthesisMachine).start();
    s.send({type:'COLLECT',context:ctx});
    return s.getSnapshot().value === 't1_collection';
  }), { numRuns: 50 }); c += 50;
  return c;
}

export function testOrchestrator(): number {
  let c = 0;
  fc.assert(fc.property(fc.constantFrom('CODE_REVIEW','DEEP_PLANNING','PROBLEM_SOLVING','CONTEXT_SYNTHESIS'), (mode) => {
    const m = new OrchestratorMachineV2();
    m.startMode(mode as any);
    return m.getStatus() === 'RUNNING' && m.getLayer() === 0;
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.string({minLength:1}), (reason) => {
    const m = new OrchestratorMachineV2();
    m.startMode('CODE_REVIEW');
    m.fail('test: ' + reason);
    return m.getStatus() === 'ERROR';
  }), { numRuns: 50 }); c += 50;
  fc.assert(fc.property(fc.array(fc.string()), (items) => {
    const r = deduplicateFindings(items.map((s,i) => ({file:s,line:i,category:'t',severity:'HIGH' as const,layer:0,detector:'d',title:'t',evidence:'e',remediation:'r',evidenceType:'STATIC' as const})));
    return Array.isArray(r);
  }), { numRuns: 30 }); c += 30;
  return c;
}
