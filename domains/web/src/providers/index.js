// Lookup providers: adapters that answer "is this name free?" for whole domain names. The
// search never talks to a registrar directly; it asks the chosen provider, and falls back
// to the next one if the first can't be reached. Adding a service means adding a file here
// that exports the same shape and listing it below.
//
//   {
//     id, name,                     'namecheap', 'Namecheap'
//     about,                        one line for the About page and the provider picker
//     live,                         true when answers come from the registry right now
//     check(names, onResult, { signal })
//                                   resolves when every name has had one onResult call
//                                   (or the signal aborts); rejects with
//                                   { code: 'unreachable' } when it can't start at all
//   }
//
// A result is { name, status, source } plus what the provider knows:
//   status    'free'      the registry says it can be registered
//             'taken'     someone has it
//             'maybe'     no registration found, but the check wasn't the registry's own
//             'unknown'   no answer
//   premium, price, renew, currency    a registry premium and its price
//   registrar, since                   who holds a taken name, and since when
//   elsewhere                          how many other extensions this label is taken in
//   reason                             the provider's own words

import namecheap from './namecheap.js'
import rdap from './rdap.js'

export const PROVIDERS = [namecheap, rdap]

export const provider = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[0]

export const fallback = (id) => PROVIDERS.find((p) => p.id !== id) || null
