--
-- PostgreSQL database dump
--

\restrict ubs4Igije2Og5Z9xz6ryA8IpsNMx4j0YdwnA3bM8FNAxv48vtgxrKY0VdpYVV8g

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

-- Started on 2026-11-24 00:06:14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 237 (class 1255 OID 31868)
-- Name: upsert_cooccurrence_batch(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.upsert_cooccurrence_batch(p_batch_size integer) RETURNS TABLE(processed_specs integer, patterns_affected integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_processed INT;
    v_patterns INT;
BEGIN
    -- 1. Cria tabela temporária com o lote atual de especificações pendentes
    CREATE TEMP TABLE tmp_target_specs ON COMMIT DROP AS
    SELECT DISTINCT ps.spec_id, ps.oas_version
    FROM parsed_specs ps
    JOIN extracted_components ec ON ps.spec_id = ec.spec_id
    WHERE NOT EXISTS (
        SELECT 1 FROM cooccurrence_patterns cp 
        WHERE cp.domain_category = 'PROCESSED_SPEC_' || ps.spec_id::text
    )
    LIMIT p_batch_size;

    SELECT COUNT(*) INTO v_processed FROM tmp_target_specs;

    IF v_processed = 0 THEN
        RETURN QUERY SELECT 0, 0;
        RETURN;
    END IF;

    -- 2. Calcula e faz o Upsert (INSERT ON CONFLICT) dos pares do lote
    WITH batch_pairs AS (
        SELECT 
            ca.component_type AS type_a,
            ca.component_name AS name_a,
            cb.component_type AS type_b,
            cb.component_name AS name_b,
            ts.oas_version,
            COUNT(DISTINCT ca.spec_id) AS batch_count
        FROM extracted_components ca
        JOIN extracted_components cb 
          ON ca.spec_id = cb.spec_id 
         AND (ca.component_type < cb.component_type OR (ca.component_type = cb.component_type AND ca.component_name < cb.component_name))
        JOIN tmp_target_specs ts ON ca.spec_id = ts.spec_id
        GROUP BY ca.component_type, ca.component_name, cb.component_type, cb.component_name, ts.oas_version
    )
    INSERT INTO cooccurrence_patterns 
        (component_type_a, component_name_a, component_type_b, component_name_b, cooccurrence_count, oas_version)
    SELECT type_a, name_a, type_b, name_b, batch_count, oas_version
    FROM batch_pairs
    ON CONFLICT (component_type_a, component_name_a, component_type_b, component_name_b, oas_version) 
    DO UPDATE SET 
        cooccurrence_count = cooccurrence_patterns.cooccurrence_count + EXCLUDED.cooccurrence_count,
        updated_at = CURRENT_TIMESTAMP;

    -- 3. Marca as especificações processadas
    INSERT INTO cooccurrence_patterns (component_type_a, component_name_a, component_type_b, component_name_b, domain_category)
    SELECT 'SYSTEM', 'TRACKER', 'SYSTEM', 'TRACKER', 'PROCESSED_SPEC_' || spec_id::text
    FROM tmp_target_specs
    ON CONFLICT DO NOTHING;

    SELECT COUNT(*) INTO v_patterns FROM cooccurrence_patterns WHERE component_type_a != 'SYSTEM';

    RETURN QUERY SELECT v_processed, v_patterns;
END;
$$;


ALTER FUNCTION public.upsert_cooccurrence_batch(p_batch_size integer) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 233 (class 1259 OID 16484)
-- Name: cooccurrence_patterns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cooccurrence_patterns (
    pattern_id bigint NOT NULL,
    component_type_a character varying(30) NOT NULL,
    component_name_a text NOT NULL,
    component_type_b character varying(30) NOT NULL,
    component_name_b text NOT NULL,
    cooccurrence_count integer DEFAULT 1 NOT NULL,
    percentage numeric(5,2),
    oas_version character varying(20),
    domain_category character varying(100),
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.cooccurrence_patterns OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 16483)
-- Name: cooccurrence_patterns_pattern_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.cooccurrence_patterns ALTER COLUMN pattern_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cooccurrence_patterns_pattern_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 231 (class 1259 OID 16462)
-- Name: extracted_components; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.extracted_components (
    component_id bigint NOT NULL,
    spec_id uuid NOT NULL,
    component_type character varying(30) NOT NULL,
    component_name text NOT NULL,
    details_json jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.extracted_components OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 16461)
-- Name: extracted_components_component_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.extracted_components ALTER COLUMN component_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.extracted_components_component_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 236 (class 1259 OID 24910)
-- Name: oas_object_catalog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.oas_object_catalog (
    catalog_id integer NOT NULL,
    object_base_name character varying(100) NOT NULL,
    normalized_type character varying(50) NOT NULL,
    path_v2 character varying(255),
    path_v3 character varying(255),
    introduced_in_version character varying(20) DEFAULT '2.0'::character varying NOT NULL,
    is_root_level boolean DEFAULT false
);


ALTER TABLE public.oas_object_catalog OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 24909)
-- Name: oas_object_catalog_catalog_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.oas_object_catalog ALTER COLUMN catalog_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.oas_object_catalog_catalog_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 229 (class 1259 OID 16444)
-- Name: parsed_specs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.parsed_specs (
    spec_id uuid NOT NULL,
    oas_version character varying(20) NOT NULL,
    total_paths integer DEFAULT 0,
    total_operations integer DEFAULT 0,
    total_schemas integer DEFAULT 0,
    has_security boolean DEFAULT false,
    parsed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.parsed_specs OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 16717)
-- Name: processing_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.processing_jobs (
    job_id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_type character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'PROCESSING'::character varying NOT NULL,
    total_records integer DEFAULT 0,
    processed_records integer DEFAULT 0,
    error_message text,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    finished_at timestamp with time zone,
    CONSTRAINT processing_jobs_status_check CHECK (((status)::text = ANY ((ARRAY['PROCESSING'::character varying, 'COMPLETED'::character varying, 'FAILED'::character varying])::text[])))
);


ALTER TABLE public.processing_jobs OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16403)
-- Name: provider_metadata; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.provider_metadata (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_platform character varying(50) NOT NULL,
    provider_key character varying(255) NOT NULL,
    api_title character varying(255),
    provider_name character varying(255),
    service_name character varying(255),
    preferred_version character varying(50),
    categories jsonb,
    raw_json jsonb NOT NULL,
    collected_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.provider_metadata OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 16419)
-- Name: spec_files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.spec_files (
    spec_id uuid DEFAULT gen_random_uuid() NOT NULL,
    metadata_id uuid,
    source_platform character varying(50) NOT NULL,
    api_version character varying(50),
    openapi_version_declared character varying(20),
    origin_url text,
    download_url text NOT NULL,
    content_format character varying(10),
    raw_spec_content jsonb,
    status_processing character varying(20) DEFAULT 'PENDING'::character varying,
    error_log text,
    sha256_hash character varying(64),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT spec_files_content_format_check CHECK (((content_format)::text = ANY ((ARRAY['JSON'::character varying, 'YAML'::character varying])::text[]))),
    CONSTRAINT spec_files_status_processing_check CHECK (((status_processing)::text = ANY ((ARRAY['PENDING'::character varying, 'DOWNLOADED'::character varying, 'VALIDATED'::character varying, 'FAILED'::character varying, 'CORRUPTED'::character varying])::text[])))
);


ALTER TABLE public.spec_files OWNER TO postgres;

--
-- TOC entry 4934 (class 2606 OID 16498)
-- Name: cooccurrence_patterns cooccurrence_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cooccurrence_patterns
    ADD CONSTRAINT cooccurrence_patterns_pkey PRIMARY KEY (pattern_id);


--
-- TOC entry 4929 (class 2606 OID 16474)
-- Name: extracted_components extracted_components_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.extracted_components
    ADD CONSTRAINT extracted_components_pkey PRIMARY KEY (component_id);


--
-- TOC entry 4943 (class 2606 OID 24922)
-- Name: oas_object_catalog oas_object_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oas_object_catalog
    ADD CONSTRAINT oas_object_catalog_pkey PRIMARY KEY (catalog_id);


--
-- TOC entry 4927 (class 2606 OID 16455)
-- Name: parsed_specs parsed_specs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parsed_specs
    ADD CONSTRAINT parsed_specs_pkey PRIMARY KEY (spec_id);


--
-- TOC entry 4941 (class 2606 OID 16732)
-- Name: processing_jobs processing_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processing_jobs
    ADD CONSTRAINT processing_jobs_pkey PRIMARY KEY (job_id);


--
-- TOC entry 4918 (class 2606 OID 16415)
-- Name: provider_metadata provider_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_metadata
    ADD CONSTRAINT provider_metadata_pkey PRIMARY KEY (id);


--
-- TOC entry 4923 (class 2606 OID 16433)
-- Name: spec_files spec_files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.spec_files
    ADD CONSTRAINT spec_files_pkey PRIMARY KEY (spec_id);


--
-- TOC entry 4925 (class 2606 OID 16435)
-- Name: spec_files spec_files_sha256_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.spec_files
    ADD CONSTRAINT spec_files_sha256_hash_key UNIQUE (sha256_hash);


--
-- TOC entry 4938 (class 2606 OID 31870)
-- Name: cooccurrence_patterns unique_pattern_pair; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cooccurrence_patterns
    ADD CONSTRAINT unique_pattern_pair UNIQUE (component_type_a, component_name_a, component_type_b, component_name_b, oas_version);


--
-- TOC entry 4930 (class 1259 OID 16482)
-- Name: idx_components_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_components_name ON public.extracted_components USING btree (component_name);


--
-- TOC entry 4931 (class 1259 OID 16480)
-- Name: idx_components_spec_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_components_spec_id ON public.extracted_components USING btree (spec_id);


--
-- TOC entry 4932 (class 1259 OID 16481)
-- Name: idx_components_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_components_type ON public.extracted_components USING btree (component_type);


--
-- TOC entry 4935 (class 1259 OID 16500)
-- Name: idx_cooccurrence_count; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cooccurrence_count ON public.cooccurrence_patterns USING btree (cooccurrence_count DESC);


--
-- TOC entry 4936 (class 1259 OID 16499)
-- Name: idx_cooccurrence_pair; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cooccurrence_pair ON public.cooccurrence_patterns USING btree (component_name_a, component_name_b);


--
-- TOC entry 4939 (class 1259 OID 16733)
-- Name: idx_processing_jobs_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_processing_jobs_status ON public.processing_jobs USING btree (status);


--
-- TOC entry 4914 (class 1259 OID 16418)
-- Name: idx_provider_metadata_categories; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_provider_metadata_categories ON public.provider_metadata USING gin (categories);


--
-- TOC entry 4915 (class 1259 OID 16417)
-- Name: idx_provider_metadata_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_provider_metadata_key ON public.provider_metadata USING btree (provider_key);


--
-- TOC entry 4916 (class 1259 OID 16416)
-- Name: idx_provider_metadata_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_provider_metadata_source ON public.provider_metadata USING btree (source_platform);


--
-- TOC entry 4919 (class 1259 OID 16441)
-- Name: idx_spec_files_metadata; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_spec_files_metadata ON public.spec_files USING btree (metadata_id);


--
-- TOC entry 4920 (class 1259 OID 16443)
-- Name: idx_spec_files_oas_ver; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_spec_files_oas_ver ON public.spec_files USING btree (openapi_version_declared);


--
-- TOC entry 4921 (class 1259 OID 16442)
-- Name: idx_spec_files_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_spec_files_status ON public.spec_files USING btree (status_processing);


--
-- TOC entry 4946 (class 2606 OID 16475)
-- Name: extracted_components extracted_components_spec_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.extracted_components
    ADD CONSTRAINT extracted_components_spec_id_fkey FOREIGN KEY (spec_id) REFERENCES public.spec_files(spec_id) ON DELETE CASCADE;


--
-- TOC entry 4945 (class 2606 OID 16456)
-- Name: parsed_specs parsed_specs_spec_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parsed_specs
    ADD CONSTRAINT parsed_specs_spec_id_fkey FOREIGN KEY (spec_id) REFERENCES public.spec_files(spec_id) ON DELETE CASCADE;


--
-- TOC entry 4944 (class 2606 OID 16436)
-- Name: spec_files spec_files_metadata_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.spec_files
    ADD CONSTRAINT spec_files_metadata_id_fkey FOREIGN KEY (metadata_id) REFERENCES public.provider_metadata(id) ON DELETE SET NULL;


-- Completed on 2026-11-24 00:06:15

--
-- PostgreSQL database dump complete
--

\unrestrict ubs4Igije2Og5Z9xz6ryA8IpsNMx4j0YdwnA3bM8FNAxv48vtgxrKY0VdpYVV8g

