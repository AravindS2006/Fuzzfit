import { z } from 'zod';
export const exerciseSchema = z.enum(['squat', 'pushup', 'curl', 'plank']);
const identifier = z.string().min(1).max(100);
const block = z.object({
  exercise: exerciseSchema,
  sets: z.number().int().min(1).max(10),
  reps: z.number().int().min(1).max(120),
  rest: z.number().int().min(0).max(300),
});
export const commandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('onboard'),
    role: z.enum(['coach', 'trainee']),
    name: z.string().trim().min(2).max(80),
    studioName: z.string().trim().max(80).optional(),
    adult: z.literal(true),
  }),
  z.object({
    action: z.literal('invite'),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
  }),
  z.object({ action: z.literal('acceptInvite'), code: z.string().min(16).max(120) }),
  z.object({
    action: z.literal('savePlan'),
    id: identifier.optional(),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(400),
    blocks: z.array(block).min(1).max(20),
  }),
  z.object({ action: z.literal('deletePlan'), id: identifier }),
  z.object({
    action: z.literal('createClass'),
    title: z.string().trim().min(2).max(80),
    startsAt: z.iso.datetime(),
    duration: z.number().int().min(10).max(120),
    capacity: z.number().int().min(1).max(8),
    planId: identifier.optional(),
    participantIds: z.array(identifier).max(8),
  }),
  z.object({
    action: z.literal('classControl'),
    id: identifier,
    control: z.enum(['start', 'pause', 'resume', 'end', 'cancel', 'exercise']),
    exercise: exerciseSchema.optional(),
  }),
  z.object({ action: z.literal('consent'), id: identifier, consent: z.literal(true) }),
  z.object({
    action: z.literal('muteParticipants'),
    id: identifier,
    participantId: identifier.optional(),
  }),
  z.object({
    action: z.literal('help'),
    id: identifier,
    requested: z.boolean(),
    userId: identifier.optional(),
  }),
  z.object({
    action: z.literal('message'),
    id: identifier,
    text: z.string().trim().min(1).max(600),
    recipientId: identifier.optional(),
    kind: z.enum(['chat', 'cue']).default('chat'),
  }),
  z.object({
    action: z.literal('profile'),
    name: z.string().trim().min(2).max(80),
    goal: z.string().trim().min(2).max(160),
  }),
]);
export const metricSchema = z.object({
  classId: identifier,
  exercise: exerciseSchema,
  revision: z.number().int().min(0),
  reps: z.number().int().min(0).max(5000),
  holdSeconds: z.number().int().min(0).max(7200),
  score: z.number().finite().min(0).max(100).nullable(),
  confidence: z.number().finite().min(0).max(1),
  phase: z.string().max(40),
  cue: z.string().max(180),
});
