import { ethers } from "ethers";
import { Web3Provider } from "@ethersproject/providers";
import { getFallbackProvider, getProvider } from "../rpc";
//var contractFetcher = function (a) {
//     return function (b) {
//        return a + b;
//     };
// };
//此处闭包的箭头函数，左边是带有泛型定义，以及输入参数类型，右边是返回一个函数 `(...args: any): Promise<T>`，该函数可以接受多个参数，返回promise,就是一个闭包
export const contractFetcher = <T>(library: Web3Provider | undefined, contractInfo: any, additionalArgs?: any[]) =>  (...args: any): Promise<T> => {
    // eslint-disable-next-line
    const [id, chainId, arg0, arg1, ...params] = args;
    const provider = getProvider(library, chainId);

    const method = ethers.utils.isAddress(arg0) ? arg1 : arg0;

    //传入合约调用的参数，返回合约调用的promise
    const contractCall = getContractCall({
      provider,
      contractInfo,
      arg0,
      arg1,
      method,
      params,
      additionalArgs,
    });

    let shouldCallFallback = true;
    //标记函数为异步函数，函数的返回值为promise对象，状态改变后触发回调函数。在异步函数中，可以调用其他的异步函数，使用await关键字 ，await会等待promise完成后直接返回成功的结果，await 需要再async函数中，执行await 会出现等待
    //async函数返回的 Promise 对象，必须等到内部所有await命令后面的 Promise 对象执行完，才会发生状态改变，除非遇到return语句或者抛出错误。也就是说，只有async函数内部的异步操作执行完，才会执行then方法指定的回调函数。
    const handleFallback = async (resolve, reject, error) => {
      if (!shouldCallFallback) {
        return;
      }
      // prevent fallback from being called twice
      shouldCallFallback = false;

      const fallbackProvider = getFallbackProvider(chainId);
      if (!fallbackProvider) {
        reject(error);
        return;
      }

      // eslint-disable-next-line no-console
      console.info("using fallbackProvider for", method);
      const fallbackContractCall = getContractCall({
        provider: fallbackProvider,
        contractInfo,
        arg0,
        arg1,
        method,
        params,
        additionalArgs,
      });

      fallbackContractCall
        .then((result) => resolve(result))
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.error("fallback fetcher error", id, contractInfo.contractName, method, e);
          reject(e);
        });
    };
   // Promise构造函数接受一个函数作为参数，该函数的两个参数分别是resolve和reject。它们是两个函数，由 JavaScript 引擎提供，不用自己部署。
   // 分别表示 Promise 成功和失败的状态。起始函数执行成功时，它应该调用 resolve 函数并传递成功的结果。当起始函数执行失败时，它应该调用 reject 函数并传递失败的原因。
   // Promise 构造函数返回一个 Promise 对象，该对象具有以下几个方法：
   // then：用于处理 Promise 成功状态的回调函数。
   // catch：用于处理 Promise 失败状态的回调函数。
   // finally：无论 Promise 是成功还是失败，都会执行的回调函数。
   //  const promise = new Promise((resolve, reject) => {
   //    // 异步操作
   //    setTimeout(() => {
   //      if (Math.random() < 0.5) {
   //        resolve('success');
   //      } else {
   //        reject('error');
   //      }
   //    }, 1000);
   //  });
   //
   //  promise.then(result => {
   //    console.log(result);
   //  }).catch(error => {
   //    console.log(error);
   //  });

    // async函数返回一个 Promise 对象。
    // async函数内部return语句返回的值，会成为then方法回调函数的参数。
    // async function f() {
    //   return 'hello world';
    // }
    //
    // f().then(v => console.log(v))
    // // "hello world"
    // async函数完全可以看作多个异步操作，包装成的一个 Promise 对象，而await命令就是内部then命令的语法糖。
    return new Promise(async (resolve, reject) => {
      contractCall
        .then((result) => {
          shouldCallFallback = false;
          resolve(result);
        })
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.error("fetcher error", id, contractInfo.contractName, method, e);
          handleFallback(resolve, reject, e);
        });

      setTimeout(() => {
        handleFallback(resolve, reject, "contractCall timeout");
      }, 2000);
    });
  };

//解构传参数
function getContractCall({ provider, contractInfo, arg0, arg1, method, params, additionalArgs }) {
  if (ethers.utils.isAddress(arg0)) {
    const address = arg0;
    const contract = new ethers.Contract(address, contractInfo.abi, provider);

    if (additionalArgs) {
      return contract[method](...params.concat(additionalArgs));
    }
    return contract[method](...params);
  }

  if (!provider) {
    return;
  }

  return provider[method](arg1, ...params);
}
