// ==UserScript==
// @name         Plurk shadow block
// @name:zh-TW   噗浪隱形黑名單
// @description  Shadow blocks user (only blocks on responses and timeline of yourself)
// @description:zh-TW 隱形封鎖使用者（只是會在回應和在河道上看不到被封鎖者的發文、轉噗，其他正常）
// @match        https://www.plurk.com/*
// @version      0.3.3
// @license      MIT
// @require      https://code.jquery.com/jquery-3.5.1.min.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        window.onurlchange
// ==/UserScript==

/* jshint esversion: 6 */
/* global $ */

(function () {
  'use strict';
  const LANG = {
    DEFAULT: {
      resp_btn_hide: 'Hide blocked responses',
      resp_btn_show: 'Show blocked responses',
      set_alert: 'Incorrect format of nick name!',
      set_append: 'Append',
      set_empty: 'There is no one in your blocklist.',
      set_note:
        'A blocked user will not be shown on responses and your timeline,' +
        ' but is still able to see your profile, follow you,' +
        ' respond to your plurks or befriend you.',
      set_remove: 'Remove',
      set_tab: 'Shadow Block'
    },
    'zh-hant': {
      resp_btn_hide: '隱藏被封鎖的回應',
      resp_btn_show: '顯示被封鎖的回應',
      set_alert: '帳號格式不正確',
      set_append: '新增',
      set_empty: '沒有任何人在黑名單中',
      set_note: '在回應區和自己的河道上看不到被封鎖者的發文、轉噗；' +
        '但對方仍可瀏覽您的個人檔案，關注、回應您的訊息，或加您為朋友。',
      set_remove: '移除',
      set_tab: '隱形黑名單'
    }
  };
  let lang = LANG.DEFAULT;
  const curLang = document.body.parentElement.getAttribute('lang') || '';
  if (curLang.toLowerCase() in LANG) lang = LANG[curLang.toLowerCase()];

  /* ======= storage ======= */
  const DEFAULT_GM_VALUE = {
    replurk: true,
    response: true,
    blocklist: []
  };
  Object.keys(DEFAULT_GM_VALUE).forEach(k => {
    if (typeof GM_getValue(k) !== typeof DEFAULT_GM_VALUE[k]) {
      GM_setValue(k, DEFAULT_GM_VALUE[k]);
    }
  });
  function gmValueGetSet (key, val = null) {
    if (val != null) GM_setValue(key, val);
    return GM_getValue(key);
  }
  const DEFAULT_LOCAL_VALUE = { blocklist: {} };
  Object.keys(DEFAULT_LOCAL_VALUE).forEach(k => {
    if (localValueGetSet(k) == null ||
        typeof localValueGetSet(k) !== typeof DEFAULT_LOCAL_VALUE[k]) {
      localValueGetSet(k, DEFAULT_LOCAL_VALUE[k]);
    }
  });
  function localValueGetSet (key, val = null) {
    if (val != null) window.localStorage.setItem(key, JSON.stringify(val));
    return JSON.parse(window.localStorage.getItem(key));
  }

  /* ============== */
  GM_addStyle(
    '.hide {display:none}' +
    '.resp-hidden-show {background:#f5f5f9;color:#afb8cc;' +
    '  font-weight:normal;vertical-align:top;transform:scale(0.9);opacity:0;}' +
    '.resp-hidden-show.show {opacity:1}' +
    '.response-status:hover .resp-hidden-show {opacity:1}' +
    '.resp-hidden-show:hover {background:#afb8cc;color:#fff}'
  );

  if (window.location.pathname.match(/^\/p\/[A-Za-z]\w+$/)) {
    // responses
    const respMo = new MutationObserver(responseMutationHandler);
    respMo.observe($('#plurk_responses .list')[0], { childList: true });
    makeButton($('#plurk_responses>.response_box'));
    // pop window
    const cboxMo = new MutationObserver(responseMutationHandler);
    cboxMo.observe($('#cbox_response .list')[0], { childList: true });
    makeButton($('#cbox_response>.response_box'));
  } else if (window.location.pathname === '/Friends/') {
    $('<li><a void="">' + lang.set_tab + '</a></li>').on('click', function () {
      window.history.pushState('', document.title, '/Friends/');
      $('#pop-window-tabs>ul>li').removeClass('current');
      this.classList.add('current');
      const $content = $('#pop-window-inner-content .content_inner').empty();
      $content.append(
        '<div class="note">' + lang.set_note + '</div>',
        '<div class="dashboard">' +
        ' <div class="search_box"><input>' +
        '  <button>' + lang.set_append + '</button></div>' +
        ' <div class="empty">' + lang.set_empty + '</div>' +
        '</div>');
      const $holder = $('<div class="item_holder"></div>').appendTo($content);
      const usersInfo = Array.from(gmValueGetSet('blocklist'),
        id => getUserInfoAsync(id));
      if (usersInfo.length) $content.find('.dashboard .empty').addClass('hide');
      Promise.all(usersInfo).then(infomations => infomations.forEach(info => {
        makeBlockedUserItem(info, $holder);
      }));
      $content.find('.search_box>button').on('click', function () {
        const m = this.parentElement.children[0].value.match(/^[A-Za-z]\w+$/);
        if (m) {
          const blocklist = gmValueGetSet('blocklist');
          blocklist.push(m[0]);
          gmValueGetSet('blocklist', blocklist);
          this.parentElement.children[0].value = '';
          $content.find('.dashboard .empty').addClass('hide');
          getUserInfoAsync(m[0])
            .then(info => makeBlockedUserItem(info, $holder));
        } else { window.alert(lang.set_alert); }
      });
    }).appendTo('#pop-window-tabs>ul');
  } else if (window.location.pathname === '/anonymous' ||
      $('#nav-account>span').text() === window.location.pathname.substr(1)) {
    // timeline
    const cntMo = new MutationObserver(responseMutationTimeline);
    cntMo.observe($('div.block_cnt')[0], { childList: true });
    const formMo = new MutationObserver(responseMutationHandler);
    formMo.observe($('#form_holder .list')[0], { childList: true });
    makeButton($('#form_holder>.response_box'));
    // pop window
    const cboxMo = new MutationObserver(responseMutationHandler);
    cboxMo.observe($('#cbox_response .list')[0], { childList: true });
    makeButton($('#cbox_response>.response_box'));
  }

  function responseMutationTimeline (records) {
    records.forEach(mu => {
      mu.addedNodes.forEach(node => {
        const up = $(node).find('.td_img>.p_img a')[0].href.split('/').pop();
        const u0 = $(node).find('.td_qual a.name')[0].href.split('/').pop();
        if (isOnBlockList(up) || isOnBlockList(u0)) {
          node.classList.add('shadow-block', 'hide');
        }
      });
    });
  }

  function responseMutationHandler (records) {
    records.forEach(mu => {
      const $btn = $(mu.target).parent().find('.resp-hidden-show');
      if (!mu.target.querySelector('.handle-remove')) {
        $('<div class="handle-remove hide"></div>').prependTo(mu.target);
      }
      mu.removedNodes.forEach(node => {
        if (node.classList.contains('handle-remove')) {
          $btn.removeClass('show').addClass('hide').text(lang.resp_btn_show);
        }
      });
      let nBlock = 0;
      mu.addedNodes.forEach(node => {
        if (!node.classList.contains('plurk')) return;
        const u0 = $(node).find('a.name')[0].href.split('/').pop();
        const u1 = `${node.dataset.pid}:` +
          (u0 !== 'anonymous' ? u0 : $(node).find('a.name')[0].innerText);
        if (isOnBlockList(u0) || isOnLocalBlockList(u1)) {
          nBlock += 1;
          node.classList.add('shadow-block');
          if (!$btn.hasClass('show')) node.classList.add('hide');
        }
      });
      if ($btn.hasClass('hide') && nBlock) $btn.removeClass('hide');
    });
  }

  function makeButton ($responseBox) {
    const $formBtn = $('<div>' + lang.resp_btn_show + '</div>');
    $formBtn.on('click', function () {
      $formBtn.toggleClass('show');
      this.innerText =
        $formBtn.hasClass('show') ? lang.resp_btn_hide : lang.resp_btn_show;
      $responseBox.children('.list').children('.shadow-block')
        .toggleClass('hide');
    }).addClass(['resp-hidden-show', 'button', 'small-button', 'hide'])
      .insertAfter($responseBox.find('.response-only-owner'));
  }

  function makeBlockedUserItem (info, holder) {
    const $u = $('<div class="user_item user_blocked_users_item"></div>');
    $u.append(
      '<a class="user_avatar" target="_blank">' +
        '<img class="profile_pic" src="' + info.img + '"></img></a>',
      '<div class="user_info">' +
        '<a class="user_link" target="_blank" style="color:#000">' + info.name +
        '</a>' +
        '<span class="nick_name">@' + info.id + '</span>' +
        '<div class="more_info"><br></div>' +
      '</div>',
      '<div class="user_action"><a void="" data-id="' + info.id + '" ' +
        'class="friend_man icon_only pif-user-blocked has_block" ' +
        'title="' + lang.set_remove + '"></a></div>'
    );
    $u.find('a:not(.has_block)').attr('href', '/' + info.id);
    $u.find('a.has_block').on('click', function () {
      const blocklist = gmValueGetSet('blocklist');
      for (let i = 0; i < blocklist.length; ++i) {
        if (blocklist[i] === this.dataset.id) {
          blocklist.splice(i, 1);
          gmValueGetSet('blocklist', blocklist);
          $u.remove();
          break;
        }
      }
    });
    $u.appendTo(holder);
  }

  function getUserInfoAsync (id) {
    const ico = 'https://www.plurk.com/favicon.ico';
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.responseType = 'document';
        xhr.onload = function () {
          const b = xhr.responseXML.body;
          const img = b.querySelector('#profile_pic');
          const name = b.querySelector('#full_name>.display_name');
          const title = xhr.responseXML.title;
          resolve({
            id: id,
            img: img ? img.src : ico,
            name: name
              ? name.innerText
              : (title.match(/(.+) \[.+\]/) || title.match(/(.+) - Plurk/))[1]
          });
        };
        xhr.onerror = function () { resolve({ id: id, name: id, img: ico }); };
        xhr.open('GET', 'https://www.plurk.com/' + id);
        xhr.send();
      } catch (e) { resolve({ id: id, name: id, img: ico }); }
    });
  }

  function isOnLocalBlockList (user) {
    user = user.split(':');
    const list = localValueGetSet('blocklist');
    return Object.prototype.hasOwnProperty.call(list, user[0]) &&
           list[user[0]].includes(user[1]);
  }

  function isOnBlockList (user) {
    return gmValueGetSet('blocklist').includes(user);
  }
})();
