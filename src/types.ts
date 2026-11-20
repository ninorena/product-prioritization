export type Step = 'brainstorm' | 'placement' | 'compare' | 'vote' | 'closed';
export const STEPS: Step[] = ['brainstorm', 'placement', 'compare', 'vote', 'closed'];

export interface Workspace { id: string; name: string; owner_id: string }
export interface Member { id: string; workspace_id: string; display_name: string; role: 'lead' | 'member'; link_active: boolean }
export interface Round { id: string; workspace_id: string; step: Step; created_at: string }
export interface Response { id: string; member_id: string; prompt: string | null; body: string; question_unknown: boolean; created_at: string }
export interface Note { id: string; round_id: string; member_id: string; response_id: string | null; body: string; created_at: string }
export interface Placement { note_id: string; member_id: string; round_id: string; x: number; y: number }
export interface Vote { note_id: string; member_id: string; round_id: string }

export const STEP_LABEL: Record<Step, string> = {
  brainstorm: 'Brainstorm',
  placement: 'Place the notes on your own board',
  compare: 'Compare the boards',
  vote: 'Vote',
  closed: 'Round closed',
};

// The lead's button for each step moves the round to the next step.
export const NEXT_ACTION: Partial<Record<Step, string>> = {
  brainstorm: 'Close the brainstorm',
  placement: 'Open the compare step',
  compare: 'Open the vote',
  vote: 'Close the vote',
};
