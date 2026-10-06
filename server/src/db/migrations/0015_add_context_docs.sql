CREATE TABLE "agent_context_docs" (
	"agent_id" uuid NOT NULL,
	"path" text NOT NULL,
	"position" integer,
	CONSTRAINT "agent_context_docs_agent_id_path_pk" PRIMARY KEY("agent_id","path"),
	CONSTRAINT "agent_context_docs_position_check" CHECK ("agent_context_docs"."position" IS NULL OR "agent_context_docs"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "skill_context_docs" (
	"skill_id" uuid NOT NULL,
	"path" text NOT NULL,
	"position" integer,
	CONSTRAINT "skill_context_docs_skill_id_path_pk" PRIMARY KEY("skill_id","path"),
	CONSTRAINT "skill_context_docs_position_check" CHECK ("skill_context_docs"."position" IS NULL OR "skill_context_docs"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agent_context_docs" ADD CONSTRAINT "agent_context_docs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_context_docs" ADD CONSTRAINT "skill_context_docs_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_context_docs_agent_position_uq" ON "agent_context_docs" USING btree ("agent_id","position") WHERE "agent_context_docs"."position" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_context_docs_skill_position_uq" ON "skill_context_docs" USING btree ("skill_id","position") WHERE "skill_context_docs"."position" is not null;