const dns = require('dns');
const net = require('net');

const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.de', 'grr.la',
  'guerrillamailblock.com', 'pokemail.net', 'spam4.me', 'throwaway.email',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'fakeinbox.com',
  'sharklasers.com', 'guerrillamail.info', 'guerrillamail.biz',
  'guerrillamail.net', 'guerrillamail.org', 'dispostable.com',
  'yopmail.com', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf',
  'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr',
  'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf',
  'monmail.fr.nf', 'tempail.com', 'tempr.email', 'discard.email',
  'discardmail.com', 'discardmail.de', 'trashmail.com', 'trashmail.me',
  'trashmail.net', 'trashmail.org', 'trashmail.at', 'trashmail.ws',
  'trashmailer.com', 'trashmails.com', 'mailnesia.com', 'maildrop.cc',
  'mailcatch.com', 'mail-temporaire.fr', 'filzmail.com', 'getairmail.com',
  'einrot.com', 'cuvox.de', 'armyspy.com', 'dayrep.com', 'fleckens.hu',
  'gustr.com', 'jourrapide.com', 'rhyta.com', 'superrito.com',
  'teleworm.us', '10minutemail.com', '10minutemail.net', 'minutemail.com',
  'tempinbox.com', 'tempomail.fr', 'throwam.com', 'tmpmail.net',
  'tmpmail.org', 'binkmail.com', 'bobmail.info', 'chammy.info',
  'devnullmail.com', 'emailigo.de', 'emailtemporario.com.br',
  'ephemail.net', 'gishpuppy.com', 'harakirimail.com', 'mailexpire.com',
  'mailforspam.com', 'mailfreeonline.com', 'mailguard.me', 'mailimate.com',
  'mailnull.com', 'mailshell.com', 'mailsiphon.com', 'mailzilla.com',
  'nomail.pw', 'nowmymail.com', 'objectmail.com', 'obobbo.com',
  'onewaymail.com', 'owlpic.com', 'pjjkp.com', 'proxymail.eu',
  'rcpt.at', 'reallymymail.com', 'recode.me', 'regbypass.com',
  'safetymail.info', 'shitmail.me', 'spamavert.com', 'spambox.us',
  'spamcero.com', 'spamcorptastic.com', 'spamcowboy.com', 'spamcowboy.net',
  'spamcowboy.org', 'spamday.com', 'spamfree24.com', 'spamfree24.de',
  'spamfree24.eu', 'spamfree24.info', 'spamfree24.net', 'spamfree24.org',
  'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org', 'spamherelots.com',
  'spamhereplease.com', 'spamhole.com', 'spamify.com', 'spaminator.de',
  'spamkill.info', 'spaml.com', 'spaml.de', 'spammotel.com',
  'spamobox.com', 'spamoff.de', 'spamslicer.com', 'spamspot.com',
  'spamstack.net', 'spamthis.co.uk', 'spamtrail.com', 'spamtrap.ro',
  'temporaryemail.net', 'temporaryemail.us', 'temporaryforwarding.com',
  'temporaryinbox.com', 'thankyou2010.com', 'thisisnotmyrealemail.com',
  'throwawayemailaddress.com', 'tittbit.in', 'tradermail.info',
  'turual.com', 'uggsrock.com', 'wegwerfmail.de', 'wegwerfmail.net',
  'wegwerfmail.org', 'wh4f.org', 'whyspam.me', 'willhackforfood.biz',
  'willselfdestruct.com', 'wuzupmail.net', 'xagloo.com', 'xemaps.com',
  'xents.com', 'xjoi.com', 'xoxy.net', 'yuurok.com', 'zehnminutenmail.de',
  'zippymail.info', 'zoaxe.com', 'zoemail.org'
];

const DISPOSABLE_SET = new Set(DISPOSABLE_DOMAINS);

const EMAIL_SYNTAX_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function validateSyntax(email) {
  return EMAIL_SYNTAX_REGEX.test(email);
}

function isDisposable(email) {
  const domain = email.split('@')[1].toLowerCase();
  return DISPOSABLE_SET.has(domain);
}

function resolveDns(domain) {
  return new Promise((resolve) => {
    dns.resolve(domain, (err, addresses) => {
      if (err) {
        resolve({ exists: false, error: err.code });
      } else {
        resolve({ exists: true, addresses });
      }
    });
  });
}

function lookupMx(domain) {
  return new Promise((resolve) => {
    dns.resolveMx(domain, (err, records) => {
      if (err) {
        resolve({ found: false, records: [], error: err.code });
      } else {
        const sorted = records
          .map(r => ({ host: r.exchange, priority: r.priority }))
          .sort((a, b) => a.priority - b.priority);
        resolve({ found: true, records: sorted });
      }
    });
  });
}

function smtpCheck(email, mxHost, timeout = 10000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let step = 0;
    let response = '';
    let resolved = false;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);

    socket.on('timeout', () => {
      finish({ success: false, reason: 'timeout' });
    });

    socket.on('error', (err) => {
      finish({ success: false, reason: err.message });
    });

    socket.on('data', (data) => {
      response += data.toString();

      if (step === 0 && response.includes('220')) {
        step = 1;
        response = '';
        socket.write('EHLO verify.local\r\n');
      } else if (step === 1 && (response.includes('250') || response.includes('220'))) {
        step = 2;
        response = '';
        socket.write('MAIL FROM:<verify@verify.local>\r\n');
      } else if (step === 2 && response.includes('250')) {
        step = 3;
        response = '';
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (step === 3) {
        const code = parseInt(response.substring(0, 3), 10);
        step = 4;
        socket.write('QUIT\r\n');
        if (code === 250) {
          finish({ success: true, reason: 'accepted' });
        } else if (code === 550 || code === 551 || code === 552 || code === 553) {
          finish({ success: false, reason: 'rejected', code });
        } else {
          finish({ success: null, reason: 'inconclusive', code });
        }
      } else if (step === 4) {
        finish({ success: null, reason: 'quit' });
      }
    });

    socket.on('close', () => {
      finish({ success: null, reason: 'connection_closed' });
    });

    try {
      socket.connect(25, mxHost);
    } catch (err) {
      finish({ success: false, reason: err.message });
    }
  });
}

async function verifyEmail(email) {
  const result = {
    email,
    valid: false,
    mxRecords: [],
    smtpCheck: null,
    disposable: false,
    score: 0,
    status: 'unknown'
  };

  if (!validateSyntax(email)) {
    result.status = 'invalid_syntax';
    result.score = 0;
    return result;
  }
  result.score += 20;

  const domain = email.split('@')[1].toLowerCase();

  result.disposable = isDisposable(email);
  if (result.disposable) {
    result.score = Math.max(result.score - 30, 0);
  }

  const dnsResult = await resolveDns(domain);
  if (!dnsResult.exists) {
    result.status = 'domain_not_found';
    result.score = 0;
    return result;
  }
  result.score += 20;

  const mxResult = await lookupMx(domain);
  result.mxRecords = mxResult.records;

  if (!mxResult.found || mxResult.records.length === 0) {
    result.status = 'no_mx_records';
    result.valid = false;
    result.score += 5;
    return result;
  }
  result.score += 20;

  try {
    const primaryMx = mxResult.records[0].host;
    const smtp = await smtpCheck(email, primaryMx, 10000);
    result.smtpCheck = smtp;

    if (smtp.success === true) {
      result.score += 40;
      result.valid = true;
      result.status = 'valid';
    } else if (smtp.success === false && smtp.reason === 'rejected') {
      result.valid = false;
      result.status = 'mailbox_not_found';
    } else {
      result.score += 15;
      result.valid = true;
      result.status = 'valid_domain';
    }
  } catch (err) {
    result.score += 10;
    result.valid = true;
    result.status = 'valid_domain';
    result.smtpCheck = { success: null, reason: 'error: ' + err.message };
  }

  if (result.disposable) {
    result.status = result.status === 'valid' ? 'valid_disposable' : result.status;
  }

  result.score = Math.min(result.score, 100);

  return result;
}

module.exports = {
  verifyEmail,
  validateSyntax,
  isDisposable,
  lookupMx,
  resolveDns,
  smtpCheck
};
