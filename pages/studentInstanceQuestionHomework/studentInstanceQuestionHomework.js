const util = require('util');
const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();

const error = require('@prairielearn/prairielib/error');
const logPageView = require('../../middlewares/logPageView')('studentInstanceQuestion');
const question = require('../../lib/question');
const studentInstanceQuestion = require('../shared/studentInstanceQuestion');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);


function processSubmission(req, res, callback) {
    let variant_id, submitted_answer;
    if (res.locals.question.type == 'Freeform') {
        variant_id = req.body.__variant_id;
        submitted_answer = _.omit(req.body, ['__action', '__csrf_token', '__variant_id']);
    } else {
        if (!req.body.postData) return callback(error.make(400, 'No postData', {locals: res.locals, body: req.body}));
        let postData;
        try {
            postData = JSON.parse(req.body.postData);
        } catch (e) {
            return callback(error.make(400, 'JSON parse failed on body.postData', {locals: res.locals, body: req.body}));
        }
        variant_id = postData.variant ? postData.variant.id : null;
        submitted_answer = postData.submittedAnswer;
    }
    const submission = {
        variant_id: variant_id,
        auth_user_id: res.locals.user.user_id,
        submitted_answer: submitted_answer,
        credit: res.locals.authz_result.credit,
        mode: res.locals.authz_data.mode,
    };
    sqldb.callOneRow('variants_ensure_instance_question', [submission.variant_id, res.locals.instance_question.id], (err, result) => {
        if (ERR(err, callback)) return;
        const variant = result.rows[0];
        if (req.body.__action == 'grade') {
            question.saveAndGradeSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
                if (ERR(err, callback)) return;
                callback(null, submission.variant_id);
            });
        } else if (req.body.__action == 'save') {
            question.saveSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
                if (ERR(err, callback)) return;
                callback(null, submission.variant_id);
            });
        } else {
            callback(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
        }
    });
}

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Homework') return next();
    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));
    if (req.body.__action == 'grade' || req.body.__action == 'save') {
        processSubmission(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id
                + '/?variant_id=' + variant_id);
        });
    } else if (req.body.__action == 'attach_file') {
        util.callbackify(studentInstanceQuestion.processFileUpload)(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id
                + '/?variant_id=' + variant_id);
        });
    } else if (req.body.__action == 'attach_text') {
        util.callbackify(studentInstanceQuestion.processTextUpload)(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id
                + '/?variant_id=' + variant_id);
        });
    } else if (req.body.__action == 'delete_file') {
        util.callbackify(studentInstanceQuestion.processDeleteFile)(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id
                + '/?variant_id=' + variant_id);
        });
    } else if (req.body.__action == 'report_issue') {
        sqldb.query(sql.get_group_work, {vid: req.body.__variant_id}, (err, result) => {
            if (ERR(err, next)) return;
            if(result.rowCount != 0){
                res.locals.leader_user_id = result.rows[0].user_id;
                util.callbackify(studentInstanceQuestion.processGroupIssue)(req, res, function(err, variant_id) {
                    if (ERR(err, next)) return;
                    res.redirect(res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id
                                 + '/?variant_id=' + variant_id);
                });
            }else {
                util.callbackify(studentInstanceQuestion.processIssue)(req, res, function(err, variant_id) {
                    if (ERR(err, next)) return;
                    res.redirect(res.locals.urlPrefix + '/instance_question/' + res.locals.instance_question.id
                                 + '/?variant_id=' + variant_id);
                });
            }
        });

    } else {
        next(error.make(400, 'unknown __action: ' + req.body.__action, {locals: res.locals, body: req.body}));
    }
});

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Homework') return next();
    question.getAndRenderVariant(req.query.variant_id, null, res.locals, function(err) {
        if (ERR(err, next)) return;
        logPageView(req, res, (err) => {
            if (ERR(err, next)) return;
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
    });
});


module.exports = router;
