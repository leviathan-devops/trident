// DEEP PLANNING GRAMMAR
DeepPlanningIntent = confidence:Confidence _ cmd:PlanCommand _ {
  return { confidence, extracted: { action: 'deep_planning' } };
}
Confidence = 'plan the architecture' { return 0.95; }
           / 'design' _ 'system' { return 0.90; }
           / 'architect' _ 'solution' { return 0.92; }
           / 'first principles' { return 0.95; }
           / 'component' _ 'design' { return 0.85; }
PlanCommand = 'plan' _ 'the'? _ 'architecture' { return { action: 'plan' }; }
            / 'design' _ 'a'? _ system:SystemPhrase { return { action: 'design' }; }
SystemPhrase = [a-zA-Z ]+ { return text().trim(); }
_ = [ \t]*
