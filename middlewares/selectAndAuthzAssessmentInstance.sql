-- BLOCK get_group_work
SELECT *
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN group_users AS gu ON (ai.group_id = gu.group_id)
    JOIN groups AS gr ON (gr.id = gu.group_id)
WHERE
     ai.id = $assessment_instance_id
     AND gr.deleted_at IS NULL;

-- BLOCK select_and_auth
WITH file_list AS (
    SELECT coalesce(jsonb_agg(f ORDER BY f.created_at), '[]'::jsonb) AS list
    FROM files AS f
    WHERE
        f.assessment_instance_id = $assessment_instance_id
        AND f.instance_question_id IS NULL
        AND f.deleted_at IS NULL
)
SELECT
    jsonb_set(to_jsonb(ai), '{formatted_date}',
        to_jsonb(format_date_full_compact(ai.date, COALESCE(ci.display_timezone, c.display_timezone)))) AS assessment_instance,
    CASE
        WHEN ai.date_limit IS NULL THEN NULL
        ELSE floor(extract(epoch from (ai.date_limit - $req_date::timestamptz)) * 1000)
    END AS assessment_instance_remaining_ms,
    CASE
        WHEN ai.date_limit IS NULL THEN NULL
        ELSE floor(extract(epoch from (ai.date_limit - ai.date)) * 1000)
    END AS assessment_instance_time_limit_ms,
    to_jsonb(u) AS instance_user,
    coalesce(to_jsonb(e), '{}'::jsonb) AS instance_enrollment,
    to_jsonb(a) AS assessment,
    to_jsonb(aset) AS assessment_set,
    to_jsonb(aai) AS authz_result,
    assessment_instance_label(ai, a, aset) AS assessment_instance_label,
    assessment_label(a, aset) AS assessment_label,
    fl.list AS file_list
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    LEFT JOIN group_users AS gu ON (gu.group_id = ai.group_id)
    LEFT JOIN groups AS gr ON (gr.id = gu.group_id AND gr.deleted_at IS NULL)
    JOIN users AS u ON (u.user_id = gu.user_id OR u.user_id = ai.user_id)
    LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
    JOIN LATERAL authz_assessment_instance(ai.id, $authz_data, $req_date, ci.display_timezone, TRUE) AS aai ON TRUE
    CROSS JOIN file_list AS fl
WHERE
    ai.id = $assessment_instance_id
    AND ci.id = $course_instance_id
    AND aai.authorized;