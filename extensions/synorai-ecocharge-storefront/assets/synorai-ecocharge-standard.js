(function () {
  if (window.__synoraiEcoChargeStandardLoaded) return;
  window.__synoraiEcoChargeStandardLoaded = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function readJsonScript(id) {
    var el = byId(id);
    if (!el) return null;

    try {
      return JSON.parse(el.textContent || "{}");
    } catch (error) {
      console.error("[Synorai EcoCharge] Failed to parse JSON script:", id, error);
      return null;
    }
  }

  function log() {
    if (!window.__SynoraiEcoChargeDebug) return;
    console.log.apply(
      console,
      ["[Synorai EcoCharge]"].concat(Array.prototype.slice.call(arguments)),
    );
  }

  function normalizeVariantMap(config) {
    if (!config) return null;

    if (config.variantMap && typeof config.variantMap === "object") {
      return config.variantMap;
    }

    if (config.variantMapJson && typeof config.variantMapJson === "object") {
      return config.variantMapJson;
    }

    if (typeof config.variantMapJson === "string") {
      try {
        return JSON.parse(config.variantMapJson);
      } catch (error) {
        console.error("[Synorai EcoCharge] Failed to parse variantMapJson.", error);
        return null;
      }
    }

    return null;
  }

  function getConfig() {
    var config = readJsonScript("synorai-ecocharge-standard-config");
    if (!config || !config.enabled) {
      return { ok: false, error: "No enabled Standard mode config found." };
    }

    config.variantMap = normalizeVariantMap(config);
    if (!config.variantMap) {
      return { ok: false, error: "No usable Standard fee variant map found." };
    }

    if (!config.feeByProvince || typeof config.feeByProvince !== "object") {
      return { ok: false, error: "No feeByProvince config found." };
    }

    if (!config.tagCategoryMap || typeof config.tagCategoryMap !== "object") {
      return { ok: false, error: "No tagCategoryMap config found." };
    }

    return { ok: true, config: config };
  }

  function normalizeTags(tags) {
    if (Array.isArray(tags)) {
      return tags
        .map(function (tag) {
          return String(tag).trim();
        })
        .filter(Boolean);
    }

    if (typeof tags === "string") {
      return tags
        .split(",")
        .map(function (tag) {
          return tag.trim();
        })
        .filter(Boolean);
    }

    return [];
  }

var productTagCache = {};

function getProductHandle(item) {
  if (item && typeof item.handle === "string" && item.handle.trim()) {
    return item.handle.trim();
  }

  if (item && typeof item.url === "string" && item.url.trim()) {
    var match = item.url.match(/\/products\/([^/?#]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return "";
}

function getProductJsonByHandle(handle) {
  var normalizedHandle = typeof handle === "string" ? handle.trim() : "";
  if (!normalizedHandle) {
    return Promise.resolve(null);
  }

  if (productTagCache[normalizedHandle]) {
    return productTagCache[normalizedHandle];
  }

  productTagCache[normalizedHandle] = fetch(
    "/products/" + encodeURIComponent(normalizedHandle) + ".js",
    {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    },
  )
    .then(parseJsonResponse)
    .catch(function (error) {
      console.error(
        "[Synorai EcoCharge] Failed product tag fallback for handle:",
        normalizedHandle,
        error,
      );
      return null;
    });

  return productTagCache[normalizedHandle];
}

function resolveLineTags(item) {
  var inlineTags = normalizeTags(item && item.tags);
  if (inlineTags.length > 0) {
    return Promise.resolve(inlineTags);
  }

  var handle = getProductHandle(item);
  if (!handle) {
    return Promise.resolve([]);
  }

  return getProductJsonByHandle(handle).then(function (product) {
    return product ? normalizeTags(product.tags) : [];
  });
}

  function toVariantGid(id) {
    if (!id || !Number.isFinite(id)) return null;
    return "gid://shopify/ProductVariant/" + id;
  }

  function parseJsonResponse(response) {
    return response.json().then(function (data) {
      if (!response.ok) {
        var message =
          (data && data.description) ||
          (data && data.message) ||
          ("Cart request failed with status " + response.status);
        throw new Error(message);
      }
      return data;
    });
  }

  function getCart() {
    return fetch("/cart.js", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    }).then(parseJsonResponse);
  }

  function addCartItem(variantId, quantity, properties) {
    var numericVariantId = Number(String(variantId).split("/").pop());
    if (!Number.isFinite(numericVariantId) || numericVariantId <= 0) {
      throw new Error("Invalid Standard fee variant ID: " + variantId);
    }

    return fetch("/cart/add.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        items: [
          {
            id: numericVariantId,
            quantity: quantity,
            properties: properties || {},
          },
        ],
      }),
    }).then(parseJsonResponse);
  }

  function changeCartLine(lineKey, quantity) {
    return fetch("/cart/change.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        id: lineKey,
        quantity: quantity,
      }),
    }).then(parseJsonResponse);
  }

  function buildFeeProps(province, category) {
    return {
      _synorai_fee: "true",
      _synorai_province: province,
      _synorai_category: category,
    };
  }

  function getVariantMapEntryByVariantId(variantMap, variantId) {
    var provinces = Object.keys(variantMap || {});
    for (var i = 0; i < provinces.length; i += 1) {
      var province = provinces[i];
      var provinceMap = variantMap[province];
      if (!provinceMap) continue;

      var categories = Object.keys(provinceMap);
      for (var j = 0; j < categories.length; j += 1) {
        var category = categories[j];
        var entry = provinceMap[category];
        if (entry && entry.variantId === variantId) {
          return { province: province, category: category, entry: entry };
        }
      }
    }
    return null;
  }

  function isFeeLine(item, feeProductId, variantMap) {
    var gidVariantId = toVariantGid(item.variant_id || null);
    if (gidVariantId && getVariantMapEntryByVariantId(variantMap, gidVariantId)) {
      return true;
    }

    var props = item.properties || {};
    if (String(props._synorai_fee || "") === "true") {
      return true;
    }

    if (feeProductId && item.product_id) {
      var numericProductId = String(feeProductId).split("/").pop();
      if (numericProductId && String(item.product_id) === numericProductId) {
        return true;
      }
    }

    return false;
  }

  function highestCategoryFromTags(tags, feeByCategory, tagCategoryMap) {
    var bestCategory = null;
    var bestFee = 0;

    for (var i = 0; i < tags.length; i += 1) {
      var category = tagCategoryMap[tags[i]];
      if (!category) continue;

      var fee = feeByCategory[category];
      if (typeof fee !== "number") continue;

      if (fee > bestFee) {
        bestFee = fee;
        bestCategory = category;
      }
    }

    return bestCategory && bestFee > 0
      ? { category: bestCategory, fee: bestFee }
      : null;
  }

function buildRequiredState(items, province, feeProductId, variantMap, feeByCategory, tagCategoryMap) {
  var grouped = {};

  function applyResolvedTags(item, tags) {
    if (isFeeLine(item, feeProductId, variantMap)) {
      return;
    }

    var quantity = typeof item.quantity === "number" ? item.quantity : 0;
    if (quantity <= 0) return;

    var resolved = highestCategoryFromTags(tags, feeByCategory, tagCategoryMap);
    if (!resolved) return;

    var provinceMap = variantMap[province];
    if (!provinceMap) return;

    var entry = provinceMap[resolved.category];
    if (!entry) return;

    var key = province + "::" + resolved.category;
    if (!grouped[key]) {
      grouped[key] = {
        province: province,
        category: resolved.category,
        variantId: entry.variantId,
        quantity: quantity,
      };
    } else {
      grouped[key].quantity += quantity;
    }
  }

  return Promise.all(
    items.map(function (item) {
      return resolveLineTags(item).then(function (tags) {
        applyResolvedTags(item, tags);
      });
    }),
  ).then(function () {
    return grouped;
  });
}

  function buildExistingState(items, feeProductId, variantMap) {
    var grouped = {};

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      if (!isFeeLine(item, feeProductId, variantMap) || !item.key) continue;

      var gidVariantId = toVariantGid(item.variant_id || null);
      if (!gidVariantId) continue;

      var matched = getVariantMapEntryByVariantId(variantMap, gidVariantId);
      if (!matched) continue;

      var key = matched.province + "::" + matched.category;
      grouped[key] = {
        key: item.key,
        quantity: item.quantity,
        province: matched.province,
        category: matched.category,
        variantId: matched.entry.variantId,
      };
    }

    return grouped;
  }

  function diffStates(required, existing) {
    var toAdd = [];
    var toUpdate = [];
    var toRemove = [];

    Object.keys(required).forEach(function (key) {
      var req = required[key];
      var ex = existing[key];

      if (!ex) {
        toAdd.push(req);
        return;
      }

      if (ex.quantity !== req.quantity) {
        toUpdate.push({
          key: ex.key,
          quantity: req.quantity,
        });
      }
    });

    Object.keys(existing).forEach(function (key) {
      if (!required[key]) {
        toRemove.push(existing[key]);
      }
    });

    return {
      toAdd: toAdd,
      toUpdate: toUpdate,
      toRemove: toRemove,
    };
  }

 function dispatchCartRefresh(hasCartMutation) {
  var names = ["cart:refresh", "cart:updated", "cart:change"];
  for (var i = 0; i < names.length; i += 1) {
    document.dispatchEvent(new CustomEvent(names[i], { bubbles: true }));
  }
  window.dispatchEvent(new CustomEvent("synorai:cart-synced", { bubbles: true }));

  if (!hasCartMutation) {
    return;
  }

  var isCartPage =
    window.location &&
    typeof window.location.pathname === "string" &&
    /^\/cart\/?$/.test(window.location.pathname);

  if (!isCartPage) {
    return;
  }

  try {
    var reloadKey = "__synoraiEcoChargeCartReloadAt";
    var now = Date.now();
    var lastReloadAt = Number(sessionStorage.getItem(reloadKey) || "0");

    if (!lastReloadAt || now - lastReloadAt > 2500) {
      sessionStorage.setItem(reloadKey, String(now));
      window.setTimeout(function () {
        window.location.reload();
      }, 150);
    }
  } catch (error) {
    window.setTimeout(function () {
      window.location.reload();
    }, 150);
  }
}

  var syncInFlight = false;
  var syncQueued = false;
  var ignoreHooks = 0;
  var syncTimer = null;

  function beginInternalMutation() {
    ignoreHooks += 1;
  }

  function endInternalMutation() {
    window.setTimeout(function () {
      ignoreHooks = Math.max(0, ignoreHooks - 1);
    }, 0);
  }

  function runSync(reason) {
    if (syncInFlight) {
      syncQueued = true;
      return Promise.resolve();
    }

    var loaded = getConfig();
    if (!loaded.ok) {
      log("Standard sync skipped:", loaded.error);
      return Promise.resolve();
    }

    var config = loaded.config;
    var province = String(config.province || "").trim();
    var feeByCategory = config.feeByProvince[province];

    if (!feeByCategory) {
      log("Standard sync skipped: no fee table for province", province);
      return Promise.resolve();
    }

    syncInFlight = true;
    beginInternalMutation();

    log("Running Standard sync:", reason);

    return getCart()
      .then(function (cart) {
        var items = Array.isArray(cart.items) ? cart.items : [];

        return buildRequiredState(
          items,
          province,
          config.feeProductId,
          config.variantMap,
          feeByCategory,
          config.tagCategoryMap,
        ).then(function (required) {
          var existing = buildExistingState(
            items,
            config.feeProductId,
            config.variantMap,
          );

          var diff = diffStates(required, existing);
          var chain = Promise.resolve();

          diff.toRemove.forEach(function (line) {
            chain = chain.then(function () {
              return changeCartLine(line.key, 0);
            });
          });

          diff.toUpdate.forEach(function (line) {
            chain = chain.then(function () {
              return changeCartLine(line.key, line.quantity);
            });
          });

          diff.toAdd.forEach(function (line) {
            chain = chain.then(function () {
              return addCartItem(
                line.variantId,
                line.quantity,
                buildFeeProps(line.province, line.category),
              );
            });
          });

                   var hasCartMutation =
            diff.toRemove.length > 0 ||
            diff.toUpdate.length > 0 ||
            diff.toAdd.length > 0;

          return chain.then(function () {
            dispatchCartRefresh(hasCartMutation);
          });
        });
      })
      .catch(function (error) {
        console.error("[Synorai EcoCharge] Standard sync failed.", error);
      })
      .finally(function () {
        endInternalMutation();
        syncInFlight = false;

        if (syncQueued) {
          syncQueued = false;
          scheduleSync("queued", 60);
        }
      });
  }

  function scheduleSync(reason, delay) {
    var wait = typeof delay === "number" ? delay : 80;

    if (syncTimer) {
      clearTimeout(syncTimer);
    }

    syncTimer = window.setTimeout(function () {
      syncTimer = null;
      runSync(reason);
    }, wait);
  }

  function isCartUrl(url) {
    var value = String(url || "");
    return (
      value.indexOf("/cart/add") !== -1 ||
      value.indexOf("/cart/change") !== -1 ||
      value.indexOf("/cart/update") !== -1 ||
      value.indexOf("/cart/clear") !== -1
    );
  }

  function wrapFetch() {
    if (!window.fetch || window.__synoraiFetchWrapped) return;

    var originalFetch = window.fetch.bind(window);
    window.__synoraiFetchWrapped = true;

    window.fetch = function (input, init) {
      var url =
        typeof input === "string"
          ? input
          : input && typeof input.url === "string"
            ? input.url
            : "";

      var method =
        (init && init.method) ||
        (input && input.method) ||
        "GET";

      return originalFetch(input, init).then(function (response) {
        if (!ignoreHooks && isCartUrl(url) && String(method).toUpperCase() !== "GET") {
          scheduleSync("fetch:" + method + ":" + url, 80);
        }
        return response;
      });
    };
  }

  function wrapXhr() {
    if (!window.XMLHttpRequest || window.__synoraiXhrWrapped) return;

    var OriginalXhr = window.XMLHttpRequest;
    window.__synoraiXhrWrapped = true;

    function WrappedXhr() {
      var xhr = new OriginalXhr();
      var requestUrl = "";
      var requestMethod = "GET";

      var originalOpen = xhr.open;
      xhr.open = function (method, url) {
        requestMethod = method || "GET";
        requestUrl = url || "";
        return originalOpen.apply(xhr, arguments);
      };

      xhr.addEventListener("loadend", function () {
        if (!ignoreHooks && isCartUrl(requestUrl) && String(requestMethod).toUpperCase() !== "GET") {
          scheduleSync("xhr:" + requestMethod + ":" + requestUrl, 80);
        }
      });

      return xhr;
    }

    WrappedXhr.UNSENT = OriginalXhr.UNSENT;
    WrappedXhr.OPENED = OriginalXhr.OPENED;
    WrappedXhr.HEADERS_RECEIVED = OriginalXhr.HEADERS_RECEIVED;
    WrappedXhr.LOADING = OriginalXhr.LOADING;
    WrappedXhr.DONE = OriginalXhr.DONE;

    window.XMLHttpRequest = WrappedXhr;
  }

  function bindAddToCartForms() {
    if (window.__synoraiFormListenerAttached) return;
    window.__synoraiFormListenerAttached = true;

    document.addEventListener(
      "submit",
      function (event) {
        var form = event.target;
        if (!form || !form.getAttribute) return;

        var action = String(form.getAttribute("action") || "");
        if (action.indexOf("/cart/add") === -1) return;

        scheduleSync("form-submit", 120);
      },
      true,
    );
  }

  var configResult = getConfig();
  if (!configResult.ok) return;

  window.SynoraiEcoChargeConfig = configResult.config;
  window.__SynoraiEcoChargeDebug = !!configResult.config.debug;
  window.SynoraiRunStandardFeeSync = function () {
    return runSync("manual");
  };

  wrapFetch();
  wrapXhr();
  bindAddToCartForms();

  if (configResult.config.autoRun) {
    runSync("startup");
  }
})();
