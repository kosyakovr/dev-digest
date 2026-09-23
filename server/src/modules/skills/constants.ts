/** Constants for the skills module. */

/** Version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Description used when a create omits one (the column is NOT NULL). */
export const DEFAULT_SKILL_DESCRIPTION = '';

/** Type assigned to a skill created from an import when none can be derived. */
export const DEFAULT_SKILL_TYPE = 'custom';

/**
 * Cap for a description derived from an imported file's first paragraph. Long
 * enough for a real sentence, short enough that the card grid stays readable.
 */
export const MAX_DERIVED_DESCRIPTION_CHARS = 200;
