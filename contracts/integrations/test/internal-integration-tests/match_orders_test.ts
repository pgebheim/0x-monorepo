import {
    artifacts as assetProxyArtifacts,
    ERC1155ProxyContract,
    ERC1155ProxyWrapper,
    ERC20ProxyContract,
    ERC20Wrapper,
    ERC721ProxyContract,
    ERC721Wrapper,
    MultiAssetProxyContract,
} from '@0x/contracts-asset-proxy';
import { DevUtilsContract } from '@0x/contracts-dev-utils';
import { ERC1155Contract as ERC1155TokenContract, Erc1155Wrapper as ERC1155Wrapper } from '@0x/contracts-erc1155';
import { DummyERC20TokenContract } from '@0x/contracts-erc20';
import { DummyERC721TokenContract } from '@0x/contracts-erc721';
import { artifacts as exchangeArtifacts, ExchangeContract, ExchangeWrapper } from '@0x/contracts-exchange';
import { ReferenceFunctions as LibReferenceFunctions } from '@0x/contracts-exchange-libs';
import { toBaseUnitAmount } from '@0x/contracts-staking';
import { blockchainTests, constants, expect, OrderFactory, orderUtils } from '@0x/contracts-test-utils';
import { ExchangeRevertErrors, orderHashUtils } from '@0x/order-utils';
import { OrderStatus, SignedOrder } from '@0x/types';
import { BigNumber } from '@0x/utils';
import * as _ from 'lodash';

import { DeploymentManager } from '../utils/deployment_manager';
import { MatchOrderTester, TokenBalances } from '../utils/match_order_tester';

const ZERO = new BigNumber(0);
const ONE = new BigNumber(1);
const TWO = new BigNumber(2);
const { isRoundingErrorCeil, isRoundingErrorFloor } = LibReferenceFunctions;

// Reduce the number of tokens to deploy to speed up tests, since we don't need
// so many.
constants.NUM_DUMMY_ERC721_TO_DEPLOY = 1;
constants.NUM_DUMMY_ERC1155_CONTRACTS_TO_DEPLOY = 1;

blockchainTests.resets('matchOrders', env => {
    let chainId: number;
    let makerAddressLeft: string;
    let makerAddressRight: string;
    let owner: string;
    let takerAddress: string;
    let feeRecipientAddressLeft: string;
    let feeRecipientAddressRight: string;

    let erc1155ProxyWrapper: ERC1155ProxyWrapper;

    let erc20Wrapper: ERC20Wrapper;
    let erc721Wrapper: ERC721Wrapper;

    let tokenBalances: TokenBalances;

    let matchOrderTester: MatchOrderTester;

    const devUtils = new DevUtilsContract(constants.NULL_ADDRESS, provider, txDefaults);
    let deployment: DeploymentManager;

    before(async () => {
        // Get the chain ID.
        chainId = await env.getChainIdAsync();
        // Create accounts
        const accounts = await env.getAccountAddressesAsync();
        const usedAddresses = ([
            owner,
            makerAddressLeft,
            makerAddressRight,
            takerAddress,
            feeRecipientAddressLeft,
            feeRecipientAddressRight,
        ] = accounts);
        const addressesWithBalances = usedAddresses.slice(1);

        deployment = await DeploymentManager.deployAsync(env);

        // FIXME - Remove these and all dependencies on wrappers
        // Create wrappers
        erc20Wrapper = new ERC20Wrapper(env.provider, addressesWithBalances, owner);
        erc721Wrapper = new ERC721Wrapper(env.provider, addressesWithBalances, owner);
        erc1155ProxyWrapper = new ERC1155ProxyWrapper(env.provider, addressesWithBalances, owner);
        // Create match order tester
        matchOrderTester = new MatchOrderTester(
            exchangeWrapper,
            erc20Wrapper,
            erc721Wrapper,
            erc1155ProxyWrapper,
            devUtils,
        );
        tokenBalances = await matchOrderTester.getBalancesAsync();
    });

    /*
    describe('matchOrders', () => {
        it('Should transfer correct amounts when right order is fully filled and values pass isRoundingErrorFloor but fail isRoundingErrorCeil', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(17, 0),
                takerAssetAmount: toBaseUnitAmount(98, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetAmount: toBaseUnitAmount(75, 0),
                takerAssetAmount: toBaseUnitAmount(13, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            // Assert is rounding error ceil & not rounding error floor
            // These assertions are taken from MixinMatchOrders::calculateMatchedFillResults
            // The rounding error is derived computating how much the left maker will sell.
            const numerator = signedOrderLeft.makerAssetAmount;
            const denominator = signedOrderLeft.takerAssetAmount;
            const target = signedOrderRight.makerAssetAmount;
            const _isRoundingErrorCeil = isRoundingErrorCeil(numerator, denominator, target);
            expect(_isRoundingErrorCeil).to.be.true();
            const _isRoundingErrorFloor = isRoundingErrorFloor(numerator, denominator, target);
            expect(_isRoundingErrorFloor).to.be.false();
            // Match signedOrderLeft with signedOrderRight
            // Note that the left maker received a slightly better sell price.
            // This is intentional; see note in MixinMatchOrders.calculateMatchedFillResults.
            // Because the left maker received a slightly more favorable sell price, the fee
            // paid by the left taker is slightly higher than that paid by the left maker.
            // Fees can be thought of as a tax paid by the seller, derived from the sale price.
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(13, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(new BigNumber('76.4705882352941176'), 16), // 76.47%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(75, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('76.5306122448979591'), 16), // 76.53%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('Should transfer correct amounts when left order is fully filled and values pass isRoundingErrorCeil but fail isRoundingErrorFloor', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(15, 0),
                takerAssetAmount: toBaseUnitAmount(90, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetAmount: toBaseUnitAmount(97, 0),
                takerAssetAmount: toBaseUnitAmount(14, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            // Assert is rounding error floor & not rounding error ceil
            // These assertions are taken from MixinMatchOrders::calculateMatchedFillResults
            // The rounding error is derived computating how much the right maker will buy.
            const numerator = signedOrderRight.takerAssetAmount;
            const denominator = signedOrderRight.makerAssetAmount;
            const target = signedOrderLeft.takerAssetAmount;
            const _isRoundingErrorFloor = isRoundingErrorFloor(numerator, denominator, target);
            expect(_isRoundingErrorFloor).to.be.true();
            const _isRoundingErrorCeil = isRoundingErrorCeil(numerator, denominator, target);
            expect(_isRoundingErrorCeil).to.be.false();
            // Match signedOrderLeft isRoundingErrorFloor right maker received a slightly better purchase price.
            // This is intentional; see note in MixinMatchOrders.calculateMatchedFillResults.
            // Because the right maker received a slightly more favorable buy price, the fee
            // paid by the right taker is slightly higher than that paid by the right maker.
            // Fees can be thought of as a tax paid by the seller, derived from the sale price.
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(15, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(13, 0),
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(90, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(new BigNumber('92.7835051546391752'), 16), // 92.78%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(2, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('92.8571428571428571'), 16), // 92.85%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('Should give right maker a better buy price when rounding', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(16, 0),
                takerAssetAmount: toBaseUnitAmount(22, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(83, 0),
                takerAssetAmount: toBaseUnitAmount(49, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            // Note:
            // The correct price buy price for the right maker would yield (49/83) * 22 = 12.988 units
            // of the left maker asset. This gets rounded up to 13, giving the right maker a better price.
            // Note:
            //  The maker/taker fee percentage paid on the right order differs because
            //  they received different sale prices. The right maker pays a
            //  fee slightly lower than the right taker.
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(16, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(22, 0),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(13, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(new BigNumber('26.5060240963855421'), 16), // 26.506%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('26.5306122448979591'), 16), // 26.531%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('Should give left maker a better sell price when rounding', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(12, 0),
                takerAssetAmount: toBaseUnitAmount(97, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(89, 0),
                takerAssetAmount: toBaseUnitAmount(1, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            // Note:
            //  The maker/taker fee percentage paid on the left order differs because
            //  they received different sale prices. The left maker pays a fee
            //  slightly lower than the left taker.
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(11, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(new BigNumber('91.6666666666666666'), 16), // 91.6%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(89, 0),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(1, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(10, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('91.7525773195876288'), 16), // 91.75%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('Should give right maker and right taker a favorable fee price when rounding', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(16, 0),
                takerAssetAmount: toBaseUnitAmount(22, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(83, 0),
                takerAssetAmount: toBaseUnitAmount(49, 0),
                feeRecipientAddress: feeRecipientAddressRight,
                makerFee: toBaseUnitAmount(10000, 0),
                takerFee: toBaseUnitAmount(10000, 0),
            });
            // Note:
            //  The maker/taker fee percentage paid on the right order differs because
            //  they received different sale prices. The right maker pays a
            //  fee slightly lower than the right taker.
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(16, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(22, 0),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(13, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(2650, 0), // 2650.6 rounded down tro 2650
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(2653, 0), // 2653.1 rounded down to 2653
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('Should give left maker and left taker a favorable fee price when rounding', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(12, 0),
                takerAssetAmount: toBaseUnitAmount(97, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
                makerFee: toBaseUnitAmount(10000, 0),
                takerFee: toBaseUnitAmount(10000, 0),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(89, 0),
                takerAssetAmount: toBaseUnitAmount(1, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            // Note:
            //  The maker/taker fee percentage paid on the left order differs because
            //  they received different sale prices. The left maker pays a
            //  fee slightly lower than the left taker.
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(11, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(9166, 0), // 9166.6 rounded down to 9166
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(89, 0),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(1, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(10, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(9175, 0), // 9175.2 rounded down to 9175
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('Should transfer correct amounts when right order fill amount deviates from amount derived by `Exchange.fillOrder`', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(1000, 0),
                takerAssetAmount: toBaseUnitAmount(1005, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(2126, 0),
                takerAssetAmount: toBaseUnitAmount(1063, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(1000, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                // Notes:
                //  i.
                //    The left order is fully filled by the right order, so the right maker must sell 1005 units of their asset to the left maker.
                //    By selling 1005 units, the right maker should theoretically receive 502.5 units of the left maker's asset.
                //    Since the transfer amount must be an integer, this value must be rounded down to 502 or up to 503.
                //  ii.
                //    If the right order were filled via `Exchange.fillOrder` the respective fill amounts would be [1004, 502] or [1006, 503].
                //    It follows that we cannot trigger a sale of 1005 units of the right maker's asset through `Exchange.fillOrder`.
                //  iii.
                //    For an optimal match, the algorithm must choose either [1005, 502] or [1005, 503] as fill amounts for the right order.
                //    The algorithm favors the right maker when the exchange rate must be rounded, so the final fill for the right order is [1005, 503].
                //  iv.
                //    The right maker fee differs from the right taker fee because their exchange rate differs.
                //    The right maker always receives the better exchange and fee price.
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1005, 0),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(503, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(new BigNumber('47.2718720602069614'), 16), // 47.27%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(497, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('47.3189087488240827'), 16), // 47.31%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts when orders completely fill each other', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // Match signedOrderLeft with signedOrderRight
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts when orders completely fill each other and taker doesnt take a profit', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(5, 18),
            });
            // Match signedOrderLeft with signedOrderRight
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts when left order is completely filled and right order is partially filled', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(20, 18),
                takerAssetAmount: toBaseUnitAmount(4, 18),
            });
            // Match signedOrderLeft with signedOrderRight
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(50, 16), // 50%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(50, 16), // 50%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts when right order is completely filled and left order is partially filled', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(50, 18),
                takerAssetAmount: toBaseUnitAmount(100, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // Match signedOrderLeft with signedOrderRight
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(10, 16), // 10%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(10, 16), // 10%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts when consecutive calls are used to completely fill the left order', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(50, 18),
                takerAssetAmount: toBaseUnitAmount(100, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(10, 16), // 10%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(10, 16), // 10%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            // prettier-ignore
            const matchResults = await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
            // Construct second right order
            // Note: This order needs makerAssetAmount=90/takerAssetAmount=[anything <= 45] to fully fill the right order.
            //       However, we use 100/50 to ensure a partial fill as we want to go down the "left fill"
            //       branch in the contract twice for this test.
            const signedOrderRight2 = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(100, 18),
                takerAssetAmount: toBaseUnitAmount(50, 18),
            });
            // Match signedOrderLeft with signedOrderRight2
            const expectedTransferAmounts2 = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(45, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(90, 16), // 90% (10% paid earlier)
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(90, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(90, 16), // 90%
                // Taker
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(90, 16), // 90% (10% paid earlier)
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(90, 16), // 90%
            };

            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight2,
                    leftOrderTakerAssetFilledAmount: matchResults.orders.leftOrderTakerAssetFilledAmount,
                },
                takerAddress,
                expectedTransferAmounts2,
                false,
                await matchOrderTester.getBalancesAsync(),
            );
        });

        it('should transfer the correct amounts when consecutive calls are used to completely fill the right order', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });

            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(50, 18),
                takerAssetAmount: toBaseUnitAmount(100, 18),
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(2, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(4, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(4, 16), // 4%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(6, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(4, 16), // 4%
            };
            const matchResults = await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );

            // Create second left order
            // Note: This order needs makerAssetAmount=96/takerAssetAmount=48 to fully fill the right order.
            //       However, we use 100/50 to ensure a partial fill as we want to go down the "right fill"
            //       branch in the contract twice for this test.
            const signedOrderLeft2 = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(100, 18),
                takerAssetAmount: toBaseUnitAmount(50, 18),
            });
            // Match signedOrderLeft2 with signedOrderRight
            const expectedTransferAmounts2 = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(96, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(96, 16), // 96%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(48, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(96, 16), // 96%
                // Taker
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(96, 16), // 96%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(96, 16), // 96%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft2,
                    rightOrder: signedOrderRight,
                    rightOrderTakerAssetFilledAmount: matchResults.orders.rightOrderTakerAssetFilledAmount,
                },
                takerAddress,
                expectedTransferAmounts2,
                false,
                await matchOrderTester.getBalancesAsync(),
            );
        });

        it('should transfer the correct amounts if fee recipient is the same across both matched orders', async () => {
            const feeRecipientAddress = feeRecipientAddressLeft;
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
                feeRecipientAddress,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
                feeRecipientAddress,
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts if taker == leftMaker', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // Match orders
            takerAddress = signedOrderLeft.makerAddress;
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts if taker == rightMaker', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // Match orders
            takerAddress = signedOrderRight.makerAddress;
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts if taker == leftFeeRecipient', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // Match orders
            takerAddress = feeRecipientAddressLeft;
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts if taker == rightFeeRecipient', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // Match orders
            takerAddress = feeRecipientAddressRight;
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts if leftMaker == leftFeeRecipient && rightMaker == rightFeeRecipient', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
                feeRecipientAddress: makerAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
                feeRecipientAddress: makerAddressRight,
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts if leftMaker == leftFeeRecipient && leftMakerFeeAsset == leftTakerAsset', async () => {
            // Create orders to match
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
                makerFeeAssetData: signedOrderRight.makerAssetData,
                feeRecipientAddress: makerAddressLeft,
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts if rightMaker == rightFeeRecipient && rightMakerFeeAsset == rightTakerAsset', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
                makerFeeAssetData: signedOrderLeft.makerAssetData,
                feeRecipientAddress: makerAddressRight,
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('should transfer the correct amounts if rightMaker == rightFeeRecipient && rightTakerAsset == rightMakerFeeAsset && leftMaker == leftFeeRecipient && leftTakerAsset == leftMakerFeeAsset', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
                makerFeeAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                feeRecipientAddress: makerAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
                makerFeeAssetData: signedOrderLeft.makerAssetData,
                feeRecipientAddress: makerAddressRight,
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                false,
            );
        });

        it('Should revert if left order is not fillable', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            const orderHashHexLeft = orderHashUtils.getOrderHashHex(signedOrderLeft);
            // Cancel left order
            await exchangeWrapper.cancelOrderAsync(signedOrderLeft, signedOrderLeft.makerAddress);
            // Match orders
            const expectedError = new ExchangeRevertErrors.OrderStatusError(orderHashHexLeft, OrderStatus.Cancelled);
            const tx = exchangeWrapper.matchOrdersAsync(signedOrderLeft, signedOrderRight, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });

        it('Should revert if right order is not fillable', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            const orderHashHexRight = orderHashUtils.getOrderHashHex(signedOrderRight);
            // Cancel right order
            await exchangeWrapper.cancelOrderAsync(signedOrderRight, signedOrderRight.makerAddress);
            // Match orders
            const expectedError = new ExchangeRevertErrors.OrderStatusError(orderHashHexRight, OrderStatus.Cancelled);
            const tx = exchangeWrapper.matchOrdersAsync(signedOrderLeft, signedOrderRight, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });

        it('should revert if there is not a positive spread', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(100, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(1, 18),
                takerAssetAmount: toBaseUnitAmount(200, 18),
            });
            const orderHashHexLeft = orderHashUtils.getOrderHashHex(signedOrderLeft);
            const orderHashHexRight = orderHashUtils.getOrderHashHex(signedOrderRight);
            // Match orders
            const expectedError = new ExchangeRevertErrors.NegativeSpreadError(orderHashHexLeft, orderHashHexRight);
            const tx = exchangeWrapper.matchOrdersAsync(signedOrderLeft, signedOrderRight, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });

        it('should revert if the left maker asset is not equal to the right taker asset ', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // We are assuming assetData fields of the right order are the
            // reverse of the left order, rather than checking equality. This
            // saves a bunch of gas, but as a result if the assetData fields are
            // off then the failure ends up happening at signature validation
            const reconstructedOrderRight = {
                ...signedOrderRight,
                takerAssetData: signedOrderLeft.makerAssetData,
            };
            const orderHashHex = orderHashUtils.getOrderHashHex(reconstructedOrderRight);
            const expectedError = new ExchangeRevertErrors.SignatureError(
                ExchangeRevertErrors.SignatureErrorCode.BadOrderSignature,
                orderHashHex,
                signedOrderRight.makerAddress,
                signedOrderRight.signature,
            );
            // Match orders
            const tx = exchangeWrapper.matchOrdersAsync(signedOrderLeft, signedOrderRight, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });

        it('should revert if the right maker asset is not equal to the left taker asset', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            const reconstructedOrderRight = {
                ...signedOrderRight,
                makerAssetData: signedOrderLeft.takerAssetData,
            };
            const orderHashHex = orderHashUtils.getOrderHashHex(reconstructedOrderRight);
            const expectedError = new ExchangeRevertErrors.SignatureError(
                ExchangeRevertErrors.SignatureErrorCode.BadOrderSignature,
                orderHashHex,
                signedOrderRight.makerAddress,
                signedOrderRight.signature,
            );
            // Match orders
            const tx = exchangeWrapper.matchOrdersAsync(signedOrderLeft, signedOrderRight, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });
    });
    describe('matchOrdersWithMaximalFill', () => {
        it('should transfer correct amounts when right order is fully filled and values pass isRoundingErrorCeil but fail isRoundingErrorFloor', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(17, 0),
                takerAssetAmount: toBaseUnitAmount(98, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetAmount: toBaseUnitAmount(75, 0),
                takerAssetAmount: toBaseUnitAmount(13, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            // Assert is rounding error ceil & not rounding error floor
            // These assertions are taken from MixinMatchOrders::calculateMatchedFillResults
            // The rounding error is derived computating how much the left maker will sell.
            const numerator = signedOrderLeft.makerAssetAmount;
            const denominator = signedOrderLeft.takerAssetAmount;
            const target = signedOrderRight.makerAssetAmount;
            const _isRoundingErrorCeil = isRoundingErrorCeil(numerator, denominator, target);
            expect(_isRoundingErrorCeil).to.be.true();
            const _isRoundingErrorFloor = isRoundingErrorFloor(numerator, denominator, target);
            expect(_isRoundingErrorFloor).to.be.false();
            // Match signedOrderLeft with signedOrderRight
            // Note that the left maker received a slightly better sell price.
            // This is intentional; see note in MixinMatchOrders.calculateMatchedFillResults.
            // Because the left maker received a slightly more favorable sell price, the fee
            // paid by the left taker is slightly higher than that paid by the left maker.
            // Fees can be thought of as a tax paid by the seller, derived from the sale price.
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(13, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(new BigNumber('76.4705882352941176'), 16), // 76.47%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(75, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('76.5306122448979591'), 16), // 76.53%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('Should transfer correct amounts when left order is fully filled and values pass isRoundingErrorCeil and isRoundingErrorFloor', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(15, 0),
                takerAssetAmount: toBaseUnitAmount(90, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetAmount: toBaseUnitAmount(196, 0),
                takerAssetAmount: toBaseUnitAmount(28, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            // Assert is rounding error floor
            // These assertions are taken from MixinMatchOrders::calculateMatchedFillResults
            // The rounding error is derived computating how much the right maker will buy.
            const numerator = signedOrderRight.makerAssetAmount;
            const denominator = signedOrderRight.takerAssetAmount;
            const target = signedOrderLeft.makerAssetAmount;
            const _isRoundingErrorCeil = isRoundingErrorCeil(numerator, denominator, target);
            expect(_isRoundingErrorCeil).to.be.false();
            const _isRoundingErrorFloor = isRoundingErrorFloor(numerator, denominator, target);
            expect(_isRoundingErrorFloor).to.be.false();
            // Match signedOrderLeft with signedOrderRight
            // Note that the right maker received a slightly better purchase price.
            // This is intentional; see note in MixinMatchOrders.calculateMatchedFillResults.
            // Because the right maker received a slightly more favorable buy price, the fee
            // paid by the right taker is slightly higher than that paid by the right maker.
            // Fees can be thought of as a tax paid by the seller, derived from the sale price.
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(15, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightMakerAssetBoughtByLeftMakerAmount: toBaseUnitAmount(90, 0),
                // Right Maker
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(15, 0),
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(105, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(new BigNumber('53.5714285714285714'), 16), // 53.57%
                // Taker
                rightMakerAssetReceivedByTakerAmount: toBaseUnitAmount(15, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('53.5714285714285714'), 16), // 53.57%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('Should transfer correct amounts when left order is fully filled', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(16, 0),
                takerAssetAmount: toBaseUnitAmount(22, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(87, 0),
                takerAssetAmount: toBaseUnitAmount(48, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(16, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightMakerAssetBoughtByLeftMakerAmount: toBaseUnitAmount(22, 0),
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(29, 0),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(16, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(new BigNumber('33.3333333333333333'), 16), // 33.33%
                // Taker
                rightMakerAssetReceivedByTakerAmount: toBaseUnitAmount(7, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('33.3333333333333333'), 16), // 33.33%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('should fully fill both orders and pay out profit in both maker assets', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(7, 0),
                takerAssetAmount: toBaseUnitAmount(4, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetAmount: toBaseUnitAmount(8, 0),
                takerAssetAmount: toBaseUnitAmount(6, 0),
            });
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(7, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightMakerAssetBoughtByLeftMakerAmount: toBaseUnitAmount(4, 0), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(8, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(6, 0), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(1, 0),
                rightMakerAssetReceivedByTakerAmount: toBaseUnitAmount(4, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), //
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('Should give left maker a better sell price when rounding', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(12, 0),
                takerAssetAmount: toBaseUnitAmount(97, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(89, 0),
                takerAssetAmount: toBaseUnitAmount(1, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            // Note:
            //  The maker/taker fee percentage paid on the left order differs because
            //  they received different sale prices. The left maker pays a fee
            //  slightly lower than the left taker.
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(11, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(new BigNumber('91.6666666666666666'), 16), // 91.6%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(89, 0),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(1, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(10, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('91.7525773195876288'), 16), // 91.75%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('Should give right maker and right taker a favorable fee price when rounding', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(16, 0),
                takerAssetAmount: toBaseUnitAmount(22, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(87, 0),
                takerAssetAmount: toBaseUnitAmount(48, 0),
                feeRecipientAddress: feeRecipientAddressRight,
                makerFee: toBaseUnitAmount(10000, 0),
                takerFee: toBaseUnitAmount(10000, 0),
            });
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(16, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightMakerAssetBoughtByLeftMakerAmount: toBaseUnitAmount(22, 0),
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(29, 0),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(16, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(3333, 0), // 3333.3 repeating rounded down to 3333
                // Taker
                rightMakerAssetReceivedByTakerAmount: toBaseUnitAmount(7, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(3333, 0), // 3333.3 repeating rounded down to 3333
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('Should give left maker and left taker a favorable fee price when rounding', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(12, 0),
                takerAssetAmount: toBaseUnitAmount(97, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
                makerFee: toBaseUnitAmount(10000, 0),
                takerFee: toBaseUnitAmount(10000, 0),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(89, 0),
                takerAssetAmount: toBaseUnitAmount(1, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            // Note:
            //  The maker/taker fee percentage paid on the left order differs because
            //  they received different sale prices. The left maker pays a
            //  fee slightly lower than the left taker.
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(11, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(9166, 0), // 9166.6 rounded down to 9166
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(89, 0),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(1, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(10, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(9175, 0), // 9175.2 rounded down to 9175
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('Should give left maker a better sell price when rounding', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(12, 0),
                takerAssetAmount: toBaseUnitAmount(97, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(89, 0),
                takerAssetAmount: toBaseUnitAmount(1, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            // Note:
            //  The maker/taker fee percentage paid on the left order differs because
            //  they received different sale prices. The left maker pays a fee
            //  slightly lower than the left taker.
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(11, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(new BigNumber('91.6666666666666666'), 16), // 91.6%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(89, 0),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(1, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(10, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('91.7525773195876288'), 16), // 91.75%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('should transfer the correct amounts when consecutive calls are used to completely fill the left order', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(50, 18),
                takerAssetAmount: toBaseUnitAmount(100, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(10, 16), // 10%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(10, 16), // 10%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            // prettier-ignore
            const matchResults = await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
            // Construct second right order
            // Note: This order needs makerAssetAmount=90/takerAssetAmount=[anything <= 45] to fully fill the right order.
            //       However, we use 100/50 to ensure a partial fill as we want to go down the "left fill"
            //       branch in the contract twice for this test.
            const signedOrderRight2 = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(100, 18),
                takerAssetAmount: toBaseUnitAmount(50, 18),
            });
            // Match signedOrderLeft with signedOrderRight2
            const expectedTransferAmounts2 = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(45, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(90, 16), // 90% (10% paid earlier)
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(90, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(90, 16), // 90%
                // Taker
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(90, 16), // 90% (10% paid earlier)
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(90, 16), // 90%
            };

            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight2,
                    leftOrderTakerAssetFilledAmount: matchResults.orders.leftOrderTakerAssetFilledAmount,
                },
                takerAddress,
                expectedTransferAmounts2,
                true,
                await matchOrderTester.getBalancesAsync(),
            );
        });

        it('Should transfer correct amounts when right order fill amount deviates from amount derived by `Exchange.fillOrder`', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAddress: makerAddressLeft,
                makerAssetAmount: toBaseUnitAmount(1000, 0),
                takerAssetAmount: toBaseUnitAmount(1005, 0),
                feeRecipientAddress: feeRecipientAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAddress: makerAddressRight,
                makerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(2126, 0),
                takerAssetAmount: toBaseUnitAmount(1063, 0),
                feeRecipientAddress: feeRecipientAddressRight,
            });
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(1000, 0),
                rightMakerAssetBoughtByLeftMakerAmount: toBaseUnitAmount(1005, 0),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                // Notes:
                //  i.
                //    The left order is fully filled by the right order, so the right maker must sell 1005 units of their asset to the left maker.
                //    By selling 1005 units, the right maker should theoretically receive 502.5 units of the left maker's asset.
                //    Since the transfer amount must be an integer, this value must be rounded down to 502 or up to 503.
                //  ii.
                //    If the right order were filled via `Exchange.fillOrder` the respective fill amounts would be [1004, 502] or [1006, 503].
                //    It follows that we cannot trigger a sale of 1005 units of the right maker's asset through `Exchange.fillOrder`.
                //  iii.
                //    For an optimal match, the algorithm must choose either [1005, 502] or [1005, 503] as fill amounts for the right order.
                //    The algorithm favors the right maker when the exchange rate must be rounded, so the final fill for the right order is [1005, 503].
                //  iv.
                //    The right maker fee differs from the right taker fee because their exchange rate differs.
                //    The right maker always receives the better exchange and fee price.
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(2000, 0),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(new BigNumber('94.0733772342427093'), 16), // 94.07%
                // Taker
                rightMakerAssetReceivedByTakerAmount: toBaseUnitAmount(995, 0),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('94.0733772342427093'), 16), // 94.07%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('should transfer the correct amounts when orders completely fill each other and taker doesnt take a profit', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(5, 18),
            });
            // Match signedOrderLeft with signedOrderRight
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            // Match signedOrderLeft with signedOrderRight
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('should transfer the correct amounts when consecutive calls are used to completely fill the right order', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });

            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(50, 18),
                takerAssetAmount: toBaseUnitAmount(100, 18),
            });

            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightMakerAssetBoughtByLeftMakerAmount: toBaseUnitAmount(2, 18),
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(10, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(10, 16), // 10%
                // Taker
                rightMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(10, 16), // 10%
            };
            const matchResults = await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );

            // Create second left order
            // Note: This order needs makerAssetAmount=96/takerAssetAmount=48 to fully fill the right order.
            //       However, we use 100/50 to ensure a partial fill as we want to go down the "right fill"
            //       branch in the contract twice for this test.
            const signedOrderLeft2 = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(100, 18),
                takerAssetAmount: toBaseUnitAmount(50, 18),
            });

            // Match signedOrderLeft2 with signedOrderRight
            const expectedTransferAmounts2 = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(90, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(90, 16), // 90%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(45, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(90, 16), // 90%
                // Taker
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(90, 16), // 96%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(90, 16), // 90%
            };

            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft2,
                    rightOrder: signedOrderRight,
                    rightOrderTakerAssetFilledAmount: matchResults.orders.rightOrderTakerAssetFilledAmount,
                },
                takerAddress,
                expectedTransferAmounts2,
                true,
                await matchOrderTester.getBalancesAsync(),
            );
        });

        it('should transfer the correct amounts if fee recipient is the same across both matched orders', async () => {
            const feeRecipientAddress = feeRecipientAddressLeft;
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
                feeRecipientAddress,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
                feeRecipientAddress,
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('should transfer the correct amounts if taker == leftMaker', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // Match orders
            takerAddress = signedOrderLeft.makerAddress;
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('should transfer the correct amounts if taker == rightMaker', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // Match orders
            takerAddress = signedOrderRight.makerAddress;
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('should transfer the correct amounts if taker == leftFeeRecipient', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // Match orders
            takerAddress = feeRecipientAddressLeft;
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('should transfer the correct amounts if taker == rightFeeRecipient', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // Match orders
            takerAddress = feeRecipientAddressRight;
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('should transfer the correct amounts if leftMaker == leftFeeRecipient && rightMaker == rightFeeRecipient', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
                feeRecipientAddress: makerAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
                feeRecipientAddress: makerAddressRight,
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('should transfer the correct amounts if leftMaker == leftFeeRecipient && leftMakerFeeAsset == leftTakerAsset', async () => {
            // Create orders to match
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
                makerFeeAssetData: signedOrderRight.makerAssetData,
                feeRecipientAddress: makerAddressLeft,
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('should transfer the correct amounts if rightMaker == rightFeeRecipient && rightMakerFeeAsset == rightTakerAsset', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
                makerFeeAssetData: signedOrderLeft.makerAssetData,
                feeRecipientAddress: makerAddressRight,
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('should transfer the correct amounts if rightMaker == rightFeeRecipient && rightTakerAsset == rightMakerFeeAsset && leftMaker == leftFeeRecipient && leftTakerAsset == leftMakerFeeAsset', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerFeeAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
                feeRecipientAddress: makerAddressLeft,
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
                makerFeeAssetData: signedOrderLeft.makerAssetData,
                feeRecipientAddress: makerAddressRight,
            });
            // Match orders
            const expectedTransferAmounts = {
                // Left Maker
                leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(5, 18),
                leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Right Maker
                rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(10, 18),
                leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 18),
                rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                // Taker
                leftMakerAssetReceivedByTakerAmount: toBaseUnitAmount(3, 18),
                leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
            };
            await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                {
                    leftOrder: signedOrderLeft,
                    rightOrder: signedOrderRight,
                },
                takerAddress,
                expectedTransferAmounts,
                true,
            );
        });

        it('Should revert if left order is not fillable', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            const orderHashHexLeft = orderHashUtils.getOrderHashHex(signedOrderLeft);
            // Cancel left order
            await exchangeWrapper.cancelOrderAsync(signedOrderLeft, signedOrderLeft.makerAddress);
            // Match orders
            const expectedError = new ExchangeRevertErrors.OrderStatusError(orderHashHexLeft, OrderStatus.Cancelled);
            const tx = exchangeWrapper.matchOrdersWithMaximalFillAsync(signedOrderLeft, signedOrderRight, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });

        it('Should revert if right order is not fillable', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            const orderHashHexRight = orderHashUtils.getOrderHashHex(signedOrderRight);
            // Cancel right order
            await exchangeWrapper.cancelOrderAsync(signedOrderRight, signedOrderRight.makerAddress);
            // Match orders
            const expectedError = new ExchangeRevertErrors.OrderStatusError(orderHashHexRight, OrderStatus.Cancelled);
            const tx = exchangeWrapper.matchOrdersWithMaximalFillAsync(signedOrderLeft, signedOrderRight, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });

        it('should revert if there is not a positive spread', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(100, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(1, 18),
                takerAssetAmount: toBaseUnitAmount(200, 18),
            });
            const orderHashHexLeft = orderHashUtils.getOrderHashHex(signedOrderLeft);
            const orderHashHexRight = orderHashUtils.getOrderHashHex(signedOrderRight);
            // Match orders
            const expectedError = new ExchangeRevertErrors.NegativeSpreadError(orderHashHexLeft, orderHashHexRight);
            const tx = exchangeWrapper.matchOrdersWithMaximalFillAsync(signedOrderLeft, signedOrderRight, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });

        it('should revert if the left maker asset is not equal to the right taker asset ', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20TakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            // We are assuming assetData fields of the right order are the
            // reverse of the left order, rather than checking equality. This
            // saves a bunch of gas, but as a result if the assetData fields are
            // off then the failure ends up happening at signature validation
            const reconstructedOrderRight = {
                ...signedOrderRight,
                takerAssetData: signedOrderLeft.makerAssetData,
            };
            const orderHashHex = orderHashUtils.getOrderHashHex(reconstructedOrderRight);
            const expectedError = new ExchangeRevertErrors.SignatureError(
                ExchangeRevertErrors.SignatureErrorCode.BadOrderSignature,
                orderHashHex,
                signedOrderRight.makerAddress,
                signedOrderRight.signature,
            );
            // Match orders
            const tx = exchangeWrapper.matchOrdersWithMaximalFillAsync(signedOrderLeft, signedOrderRight, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });

        it('should revert if the right maker asset is not equal to the left taker asset', async () => {
            // Create orders to match
            const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                takerAssetData: await devUtils.encodeERC20AssetData.callAsync(defaultERC20MakerAssetAddress),
                makerAssetAmount: toBaseUnitAmount(5, 18),
                takerAssetAmount: toBaseUnitAmount(10, 18),
            });
            const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                makerAssetAmount: toBaseUnitAmount(10, 18),
                takerAssetAmount: toBaseUnitAmount(2, 18),
            });
            const reconstructedOrderRight = {
                ...signedOrderRight,
                makerAssetData: signedOrderLeft.takerAssetData,
            };
            const orderHashHex = orderHashUtils.getOrderHashHex(reconstructedOrderRight);
            const expectedError = new ExchangeRevertErrors.SignatureError(
                ExchangeRevertErrors.SignatureErrorCode.BadOrderSignature,
                orderHashHex,
                signedOrderRight.makerAddress,
                signedOrderRight.signature,
            );
            // Match orders
            const tx = exchangeWrapper.matchOrdersWithMaximalFillAsync(signedOrderLeft, signedOrderRight, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });
    });

    describe('matchOrders and matchOrdersWithMaximalFill combinations', () => {
        // tslint:disable: enum-naming
        enum AssetType {
            ERC20A = 'ERC20_A',
            ERC20B = 'ERC20_B',
            ERC20C = 'ERC20_C',
            ERC20D = 'ERC20_D',
            ERC721LeftMaker = 'ERC721_LEFT_MAKER',
            ERC721RightMaker = 'ERC721_RIGHT_MAKER',
            ERC721Taker = 'ERC721_TAKER',
            ERC1155FungibleA = 'ERC1155_FUNGIBLE_A',
            ERC1155FungibleB = 'ERC1155_FUNGIBLE_B',
            ERC1155FungibleC = 'ERC1155_FUNGIBLE_C',
            ERC1155FungibleD = 'ERC1155_FUNGIBLE_D',
            ERC1155NonFungibleLeftMaker = 'ERC1155_NON_FUNGIBLE_LEFT_MAKER',
            ERC1155NonFungibleRightMaker = 'ERC1155_NON_FUNGIBLE_RIGHT_MAKER',
            ERC1155NonFungibleTaker = 'ERC1155_NON_FUNGIBLE_TAKER',
            MultiAssetA = 'MULTI_ASSET_A',
            MultiAssetB = 'MULTI_ASSET_B',
            MultiAssetC = 'MULTI_ASSET_C',
            MultiAssetD = 'MULTI_ASSET_D',
        }
        const fungibleTypes = [
            AssetType.ERC20A,
            AssetType.ERC20B,
            AssetType.ERC20C,
            AssetType.ERC20D,
            AssetType.ERC1155FungibleA,
            AssetType.ERC1155FungibleB,
            AssetType.ERC1155FungibleC,
            AssetType.ERC1155FungibleD,
            AssetType.MultiAssetA,
            AssetType.MultiAssetB,
            AssetType.MultiAssetC,
            AssetType.MultiAssetD,
        ];
        interface AssetCombination {
            leftMaker: AssetType;
            rightMaker: AssetType;
            leftMakerFee: AssetType;
            rightMakerFee: AssetType;
            leftTakerFee: AssetType;
            rightTakerFee: AssetType;
            description?: string;
            shouldFail?: boolean;
        }
        const assetCombinations: AssetCombination[] = [
            {
                leftMaker: AssetType.ERC20A,
                rightMaker: AssetType.ERC20B,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC721LeftMaker,
                rightMaker: AssetType.ERC721RightMaker,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC721LeftMaker,
                rightMaker: AssetType.ERC20A,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC20A,
                rightMaker: AssetType.ERC721RightMaker,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC1155FungibleA,
                rightMaker: AssetType.ERC20A,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC20A,
                rightMaker: AssetType.ERC1155FungibleB,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC1155FungibleA,
                rightMaker: AssetType.ERC1155FungibleA,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC1155NonFungibleLeftMaker,
                rightMaker: AssetType.ERC20A,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC20A,
                rightMaker: AssetType.ERC1155NonFungibleRightMaker,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC1155NonFungibleLeftMaker,
                rightMaker: AssetType.ERC1155NonFungibleRightMaker,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC1155FungibleA,
                rightMaker: AssetType.ERC20A,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC20A,
                rightMaker: AssetType.ERC1155FungibleB,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC1155FungibleB,
                rightMaker: AssetType.ERC1155FungibleB,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.MultiAssetA,
                rightMaker: AssetType.ERC20A,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.ERC20A,
                rightMaker: AssetType.MultiAssetB,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.MultiAssetA,
                rightMaker: AssetType.MultiAssetB,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC20C,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                leftMaker: AssetType.MultiAssetA,
                rightMaker: AssetType.ERC1155FungibleA,
                leftMakerFee: AssetType.ERC1155FungibleA,
                rightMakerFee: AssetType.MultiAssetA,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
            },
            {
                description: 'Paying maker fees with the same ERC20 tokens being bought.',
                leftMaker: AssetType.ERC20A,
                rightMaker: AssetType.ERC20B,
                leftMakerFee: AssetType.ERC20B,
                rightMakerFee: AssetType.ERC20A,
                leftTakerFee: AssetType.ERC20B,
                rightTakerFee: AssetType.ERC20A,
            },
            {
                description: 'Paying maker fees with the same ERC20 tokens being sold.',
                leftMaker: AssetType.ERC20A,
                rightMaker: AssetType.ERC20B,
                leftMakerFee: AssetType.ERC20A,
                rightMakerFee: AssetType.ERC20B,
                leftTakerFee: AssetType.ERC20A,
                rightTakerFee: AssetType.ERC20B,
            },
            {
                description: 'Using all the same ERC20 asset.',
                leftMaker: AssetType.ERC20A,
                rightMaker: AssetType.ERC20A,
                leftMakerFee: AssetType.ERC20A,
                rightMakerFee: AssetType.ERC20A,
                leftTakerFee: AssetType.ERC20A,
                rightTakerFee: AssetType.ERC20A,
            },
            {
                description: 'Paying fees with the same MAP assets being sold.',
                leftMaker: AssetType.MultiAssetA,
                rightMaker: AssetType.MultiAssetB,
                leftMakerFee: AssetType.MultiAssetA,
                rightMakerFee: AssetType.MultiAssetB,
                leftTakerFee: AssetType.MultiAssetA,
                rightTakerFee: AssetType.MultiAssetB,
            },
            {
                description: 'Paying fees with the same MAP assets being bought.',
                leftMaker: AssetType.MultiAssetA,
                rightMaker: AssetType.MultiAssetB,
                leftMakerFee: AssetType.MultiAssetB,
                rightMakerFee: AssetType.MultiAssetA,
                leftTakerFee: AssetType.MultiAssetB,
                rightTakerFee: AssetType.MultiAssetA,
            },
            {
                description: 'Using all the same MAP assets.',
                leftMaker: AssetType.MultiAssetA,
                rightMaker: AssetType.MultiAssetA,
                leftMakerFee: AssetType.MultiAssetA,
                rightMakerFee: AssetType.MultiAssetA,
                leftTakerFee: AssetType.MultiAssetA,
                rightTakerFee: AssetType.MultiAssetA,
            },
            {
                description: 'Swapping ERC721s then using them to pay maker fees.',
                leftMaker: AssetType.ERC721LeftMaker,
                rightMaker: AssetType.ERC721RightMaker,
                leftMakerFee: AssetType.ERC721RightMaker,
                rightMakerFee: AssetType.ERC721LeftMaker,
                leftTakerFee: AssetType.ERC20A,
                rightTakerFee: AssetType.ERC20A,
            },
            {
                description: 'Swapping ERC1155 NFTs then using them to pay maker fees.',
                leftMaker: AssetType.ERC1155NonFungibleLeftMaker,
                rightMaker: AssetType.ERC1155NonFungibleRightMaker,
                leftMakerFee: AssetType.ERC1155NonFungibleRightMaker,
                rightMakerFee: AssetType.ERC1155NonFungibleLeftMaker,
                leftTakerFee: AssetType.ERC20A,
                rightTakerFee: AssetType.ERC20A,
            },
            {
                description: 'Double-spend by trying to pay maker fees with sold ERC721 token (fail).',
                leftMaker: AssetType.ERC721LeftMaker,
                rightMaker: AssetType.ERC721RightMaker,
                leftMakerFee: AssetType.ERC721LeftMaker,
                rightMakerFee: AssetType.ERC721LeftMaker,
                leftTakerFee: AssetType.ERC20A,
                rightTakerFee: AssetType.ERC20A,
                shouldFail: true,
            },
            {
                description: 'Double-spend by trying to pay maker fees with sold ERC1155 NFT (fail).',
                leftMaker: AssetType.ERC20A,
                rightMaker: AssetType.ERC1155NonFungibleLeftMaker,
                leftMakerFee: AssetType.ERC20C,
                rightMakerFee: AssetType.ERC1155NonFungibleLeftMaker,
                leftTakerFee: AssetType.ERC20C,
                rightTakerFee: AssetType.ERC20C,
                shouldFail: true,
            },
        ];

        let nameToERC20Asset: { [name: string]: string };
        let nameToERC721Asset: { [name: string]: [string, BigNumber] };
        let nameToERC1155FungibleAsset: { [name: string]: [string, BigNumber] };
        let nameToERC1155NonFungibleAsset: { [name: string]: [string, BigNumber] };
        let nameToMultiAssetAsset: { [name: string]: [BigNumber[], string[]] };

        async function getAssetDataAsync(assetType: AssetType): Promise<string> {
            const encodeERC20AssetData = await devUtils.encodeERC20AssetData.callAsync;
            const encodeERC721AssetData = await devUtils.encodeERC721AssetData.callAsync;
            const encodeERC1155AssetData = await devUtils.encodeERC1155AssetData.callAsync;
            const encodeMultiAssetData = await devUtils.encodeMultiAssetData.callAsync;
            if (nameToERC20Asset[assetType] !== undefined) {
                const tokenAddress = nameToERC20Asset[assetType];
                return encodeERC20AssetData(tokenAddress);
            }
            if (nameToERC721Asset[assetType] !== undefined) {
                const [tokenAddress, tokenId] = nameToERC721Asset[assetType];
                return encodeERC721AssetData(tokenAddress, tokenId);
            }
            if (nameToERC1155FungibleAsset[assetType] !== undefined) {
                const [tokenAddress, tokenId] = nameToERC1155FungibleAsset[assetType];
                return encodeERC1155AssetData(tokenAddress, [tokenId], [ONE], constants.NULL_BYTES);
            }
            if (nameToERC1155NonFungibleAsset[assetType] !== undefined) {
                const [tokenAddress, tokenId] = nameToERC1155NonFungibleAsset[assetType];
                return encodeERC1155AssetData(tokenAddress, [tokenId], [ONE], constants.NULL_BYTES);
            }
            if (nameToMultiAssetAsset[assetType] !== undefined) {
                const [amounts, nestedAssetData] = nameToMultiAssetAsset[assetType];
                return encodeMultiAssetData(amounts, nestedAssetData);
            }
            throw new Error(`Unknown asset type: ${assetType}`);
        }

        before(async () => {
            nameToERC20Asset = {
                ERC20_A: erc20Tokens[0].address,
                ERC20_B: erc20Tokens[1].address,
                ERC20_C: erc20Tokens[2].address,
                ERC20_D: erc20Tokens[3].address,
            };
            const erc721TokenIds = _.mapValues(tokenBalances.erc721, v => v[defaultERC721AssetAddress][0]);
            nameToERC721Asset = {
                ERC721_LEFT_MAKER: [defaultERC721AssetAddress, erc721TokenIds[makerAddressLeft]],
                ERC721_RIGHT_MAKER: [defaultERC721AssetAddress, erc721TokenIds[makerAddressRight]],
                ERC721_TAKER: [defaultERC721AssetAddress, erc721TokenIds[takerAddress]],
            };
            const erc1155FungibleTokens = _.keys(
                _.values(tokenBalances.erc1155)[0][defaultERC1155AssetAddress].fungible,
            ).map(k => new BigNumber(k));
            nameToERC1155FungibleAsset = {
                ERC1155_FUNGIBLE_A: [defaultERC1155AssetAddress, erc1155FungibleTokens[0]],
                ERC1155_FUNGIBLE_B: [defaultERC1155AssetAddress, erc1155FungibleTokens[1]],
                ERC1155_FUNGIBLE_C: [defaultERC1155AssetAddress, erc1155FungibleTokens[2]],
                ERC1155_FUNGIBLE_D: [defaultERC1155AssetAddress, erc1155FungibleTokens[3]],
            };
            const erc1155NonFungibleTokenIds = _.mapValues(
                tokenBalances.erc1155,
                v => v[defaultERC1155AssetAddress].nonFungible[0],
            );
            nameToERC1155NonFungibleAsset = {
                ERC1155_NON_FUNGIBLE_LEFT_MAKER: [
                    defaultERC1155AssetAddress,
                    erc1155NonFungibleTokenIds[makerAddressLeft],
                ],
                ERC1155_NON_FUNGIBLE_RIGHT_MAKER: [
                    defaultERC1155AssetAddress,
                    erc1155NonFungibleTokenIds[makerAddressRight],
                ],
                ERC1155_NON_FUNGIBLE_TAKER: [defaultERC1155AssetAddress, erc1155NonFungibleTokenIds[takerAddress]],
            };
            nameToMultiAssetAsset = {
                MULTI_ASSET_A: [
                    [ONE, TWO],
                    [
                        await devUtils.encodeERC20AssetData.callAsync(erc20Tokens[0].address),
                        await devUtils.encodeERC1155AssetData.callAsync(
                            defaultERC1155AssetAddress,
                            [erc1155FungibleTokens[0]],
                            [ONE],
                            constants.NULL_BYTES,
                        ),
                    ],
                ],
                MULTI_ASSET_B: [
                    [ONE, TWO],
                    [
                        await devUtils.encodeERC20AssetData.callAsync(erc20Tokens[1].address),
                        await devUtils.encodeERC1155AssetData.callAsync(
                            defaultERC1155AssetAddress,
                            [erc1155FungibleTokens[1]],
                            [ONE],
                            constants.NULL_BYTES,
                        ),
                    ],
                ],
                MULTI_ASSET_C: [
                    [ONE, TWO],
                    [
                        await devUtils.encodeERC20AssetData.callAsync(erc20Tokens[2].address),
                        await devUtils.encodeERC1155AssetData.callAsync(
                            defaultERC1155AssetAddress,
                            [erc1155FungibleTokens[2]],
                            [ONE],
                            constants.NULL_BYTES,
                        ),
                    ],
                ],
                MULTI_ASSET_D: [
                    [ONE, TWO],
                    [
                        await devUtils.encodeERC20AssetData.callAsync(erc20Tokens[3].address),
                        await devUtils.encodeERC1155AssetData.callAsync(
                            erc1155Token.address,
                            [erc1155FungibleTokens[3]],
                            [ONE],
                            constants.NULL_BYTES,
                        ),
                    ],
                ],
            };
        });

        // matchOrders
        for (const combo of assetCombinations) {
            const description = combo.description || JSON.stringify(combo);
            it(description, async () => {
                // Create orders to match. For ERC20s, there will be a spread.
                const leftMakerAssetAmount = _.includes(fungibleTypes, combo.leftMaker)
                    ? toBaseUnitAmount(15, 18)
                    : toBaseUnitAmount(1, 0);
                const leftTakerAssetAmount = _.includes(fungibleTypes, combo.rightMaker)
                    ? toBaseUnitAmount(30, 18)
                    : toBaseUnitAmount(1, 0);
                const rightMakerAssetAmount = _.includes(fungibleTypes, combo.rightMaker)
                    ? toBaseUnitAmount(30, 18)
                    : toBaseUnitAmount(1, 0);
                const rightTakerAssetAmount = _.includes(fungibleTypes, combo.leftMaker)
                    ? toBaseUnitAmount(14, 18)
                    : toBaseUnitAmount(1, 0);
                const leftMakerFeeAssetAmount = _.includes(fungibleTypes, combo.leftMakerFee)
                    ? toBaseUnitAmount(8, 12)
                    : toBaseUnitAmount(1, 0);
                const rightMakerFeeAssetAmount = _.includes(fungibleTypes, combo.rightMakerFee)
                    ? toBaseUnitAmount(7, 12)
                    : toBaseUnitAmount(1, 0);
                const leftTakerFeeAssetAmount = _.includes(fungibleTypes, combo.leftTakerFee)
                    ? toBaseUnitAmount(6, 12)
                    : toBaseUnitAmount(1, 0);
                const rightTakerFeeAssetAmount = _.includes(fungibleTypes, combo.rightTakerFee)
                    ? toBaseUnitAmount(5, 12)
                    : toBaseUnitAmount(1, 0);
                const leftMakerAssetReceivedByTakerAmount = _.includes(fungibleTypes, combo.leftMaker)
                    ? leftMakerAssetAmount.minus(rightTakerAssetAmount)
                    : toBaseUnitAmount(0, 0);
                const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                    makerAssetData: await getAssetDataAsync(combo.leftMaker),
                    takerAssetData: await getAssetDataAsync(combo.rightMaker),
                    makerFeeAssetData: await getAssetDataAsync(combo.leftMakerFee),
                    takerFeeAssetData: await getAssetDataAsync(combo.leftTakerFee),
                    makerAssetAmount: leftMakerAssetAmount,
                    takerAssetAmount: leftTakerAssetAmount,
                    makerFee: leftMakerFeeAssetAmount,
                    takerFee: leftTakerFeeAssetAmount,
                });
                const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                    makerAssetData: await getAssetDataAsync(combo.rightMaker),
                    takerAssetData: await getAssetDataAsync(combo.leftMaker),
                    makerFeeAssetData: await getAssetDataAsync(combo.rightMakerFee),
                    takerFeeAssetData: await getAssetDataAsync(combo.rightTakerFee),
                    makerAssetAmount: rightMakerAssetAmount,
                    takerAssetAmount: rightTakerAssetAmount,
                    makerFee: rightMakerFeeAssetAmount,
                    takerFee: rightTakerFeeAssetAmount,
                });
                // Match signedOrderLeft with signedOrderRight
                const expectedTransferAmounts = {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: leftMakerAssetAmount,
                    leftMakerFeeAssetPaidByLeftMakerAmount: leftMakerFeeAssetAmount,
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: rightMakerAssetAmount,
                    leftMakerAssetBoughtByRightMakerAmount: rightTakerAssetAmount,
                    rightMakerFeeAssetPaidByRightMakerAmount: rightMakerFeeAssetAmount,
                    // Taker
                    leftMakerAssetReceivedByTakerAmount,
                    leftTakerFeeAssetPaidByTakerAmount: leftTakerFeeAssetAmount,
                    rightTakerFeeAssetPaidByTakerAmount: rightTakerFeeAssetAmount,
                };
                if (!combo.shouldFail) {
                    await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                        {
                            leftOrder: signedOrderLeft,
                            rightOrder: signedOrderRight,
                        },
                        takerAddress,
                        expectedTransferAmounts,
                        false,
                    );
                } else {
                    const tx = exchangeWrapper.matchOrdersAsync(signedOrderLeft, signedOrderRight, takerAddress);
                    return expect(tx).to.be.rejected();
                }
            });
        }

        // matchOrdersWithMaximalFill
        for (const combo of assetCombinations) {
            const description = combo.description || JSON.stringify(combo);
            it(description, async () => {
                // Create orders to match. For ERC20s, there will be a spread.
                const leftMakerAssetAmount = _.includes(fungibleTypes, combo.leftMaker)
                    ? toBaseUnitAmount(15, 18)
                    : toBaseUnitAmount(1, 0);
                const leftTakerAssetAmount = _.includes(fungibleTypes, combo.rightMaker)
                    ? toBaseUnitAmount(30, 18)
                    : toBaseUnitAmount(1, 0);
                const rightMakerAssetAmount = _.includes(fungibleTypes, combo.rightMaker)
                    ? toBaseUnitAmount(30, 18)
                    : toBaseUnitAmount(1, 0);
                const rightTakerAssetAmount = _.includes(fungibleTypes, combo.leftMaker)
                    ? toBaseUnitAmount(14, 18)
                    : toBaseUnitAmount(1, 0);
                const leftMakerFeeAssetAmount = _.includes(fungibleTypes, combo.leftMakerFee)
                    ? toBaseUnitAmount(8, 12)
                    : toBaseUnitAmount(1, 0);
                const rightMakerFeeAssetAmount = _.includes(fungibleTypes, combo.rightMakerFee)
                    ? toBaseUnitAmount(7, 12)
                    : toBaseUnitAmount(1, 0);
                const leftTakerFeeAssetAmount = _.includes(fungibleTypes, combo.leftTakerFee)
                    ? toBaseUnitAmount(6, 12)
                    : toBaseUnitAmount(1, 0);
                const rightTakerFeeAssetAmount = _.includes(fungibleTypes, combo.rightTakerFee)
                    ? toBaseUnitAmount(5, 12)
                    : toBaseUnitAmount(1, 0);
                const leftMakerAssetReceivedByTakerAmount = _.includes(fungibleTypes, combo.leftMaker)
                    ? leftMakerAssetAmount.minus(rightTakerAssetAmount)
                    : toBaseUnitAmount(0, 0);
                const rightMakerAssetReceivedByTakerAmount = _.includes(fungibleTypes, combo.leftMaker)
                    ? rightMakerAssetAmount.minus(leftTakerAssetAmount)
                    : toBaseUnitAmount(0, 0);
                const signedOrderLeft = await orderFactoryLeft.newSignedOrderAsync({
                    makerAssetData: await getAssetDataAsync(combo.leftMaker),
                    takerAssetData: await getAssetDataAsync(combo.rightMaker),
                    makerFeeAssetData: await getAssetDataAsync(combo.leftMakerFee),
                    takerFeeAssetData: await getAssetDataAsync(combo.leftTakerFee),
                    makerAssetAmount: leftMakerAssetAmount,
                    takerAssetAmount: leftTakerAssetAmount,
                    makerFee: leftMakerFeeAssetAmount,
                    takerFee: leftTakerFeeAssetAmount,
                });
                const signedOrderRight = await orderFactoryRight.newSignedOrderAsync({
                    makerAssetData: await getAssetDataAsync(combo.rightMaker),
                    takerAssetData: await getAssetDataAsync(combo.leftMaker),
                    makerFeeAssetData: await getAssetDataAsync(combo.rightMakerFee),
                    takerFeeAssetData: await getAssetDataAsync(combo.rightTakerFee),
                    makerAssetAmount: rightMakerAssetAmount,
                    takerAssetAmount: rightTakerAssetAmount,
                    makerFee: rightMakerFeeAssetAmount,
                    takerFee: rightTakerFeeAssetAmount,
                });
                // Match signedOrderLeft with signedOrderRight
                const expectedTransferAmounts = {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: leftMakerAssetAmount,
                    leftMakerFeeAssetPaidByLeftMakerAmount: leftMakerFeeAssetAmount,
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: rightMakerAssetAmount,
                    leftMakerAssetBoughtByRightMakerAmount: rightTakerAssetAmount,
                    rightMakerFeeAssetPaidByRightMakerAmount: rightMakerFeeAssetAmount,
                    // Taker
                    leftMakerAssetReceivedByTakerAmount,
                    rightMakerAssetReceivedByTakerAmount,
                    leftTakerFeeAssetPaidByTakerAmount: leftTakerFeeAssetAmount,
                    rightTakerFeeAssetPaidByTakerAmount: rightTakerFeeAssetAmount,
                };
                if (!combo.shouldFail) {
                    await matchOrderTester.matchOrdersAndAssertEffectsAsync(
                        {
                            leftOrder: signedOrderLeft,
                            rightOrder: signedOrderRight,
                        },
                        takerAddress,
                        expectedTransferAmounts,
                        true,
                    );
                } else {
                    const tx = exchangeWrapper.matchOrdersWithMaximalFillAsync(
                        signedOrderLeft,
                        signedOrderRight,
                        takerAddress,
                    );
                    return expect(tx).to.be.rejected();
                }
            });
        }
    });

    describe('batchMatchOrders and batchMatchOrdersWithMaximalFill rich errors', async () => {
        it('should fail if there are zero leftOrders with the ZeroLeftOrders rich error reason', async () => {
            const leftOrders: SignedOrder[] = [];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const expectedError = new ExchangeRevertErrors.BatchMatchOrdersError(
                ExchangeRevertErrors.BatchMatchOrdersErrorCodes.ZeroLeftOrders,
            );
            let tx = exchangeWrapper.batchMatchOrdersAsync(leftOrders, rightOrders, takerAddress);
            await expect(tx).to.revertWith(expectedError);
            tx = exchangeWrapper.batchMatchOrdersWithMaximalFillAsync(leftOrders, rightOrders, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });
        it('should fail if there are zero rightOrders', async () => {
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
            ];
            const rightOrders: SignedOrder[] = [];
            const expectedError = new ExchangeRevertErrors.BatchMatchOrdersError(
                ExchangeRevertErrors.BatchMatchOrdersErrorCodes.ZeroRightOrders,
            );
            let tx = exchangeWrapper.batchMatchOrdersAsync(leftOrders, rightOrders, takerAddress);
            await expect(tx).to.revertWith(expectedError);
            tx = exchangeWrapper.batchMatchOrdersWithMaximalFillAsync(leftOrders, rightOrders, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });
        it('should fail if there are a different number of left orders and signatures', async () => {
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(2, 0),
                    takerAssetAmount: toBaseUnitAmount(1, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const params = orderUtils.createBatchMatchOrders(leftOrders, rightOrders);
            // Set params left signatures to only include the first left signature
            params.leftSignatures = [params.leftSignatures[0]];
            const expectedError = new ExchangeRevertErrors.BatchMatchOrdersError(
                ExchangeRevertErrors.BatchMatchOrdersErrorCodes.InvalidLengthLeftSignatures,
            );
            let tx = exchangeWrapper.batchMatchOrdersRawAsync(params, takerAddress);
            await expect(tx).to.revertWith(expectedError);
            tx = exchangeWrapper.batchMatchOrdersWithMaximalFillRawAsync(params, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });
        it('should fail if there are a different number of right orders and signatures', async () => {
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(2, 0),
                    takerAssetAmount: toBaseUnitAmount(1, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const params = orderUtils.createBatchMatchOrders(leftOrders, rightOrders);
            // Set params right signatures to only include the first right signature
            params.rightSignatures = [params.rightSignatures[0]];
            const expectedError = new ExchangeRevertErrors.BatchMatchOrdersError(
                ExchangeRevertErrors.BatchMatchOrdersErrorCodes.InvalidLengthRightSignatures,
            );
            let tx = exchangeWrapper.batchMatchOrdersRawAsync(params, takerAddress);
            await expect(tx).to.revertWith(expectedError);
            tx = exchangeWrapper.batchMatchOrdersWithMaximalFillRawAsync(params, takerAddress);
            return expect(tx).to.revertWith(expectedError);
        });
    });
    describe('batchMatchOrders', () => {
        it('should correctly match two opposite orders', async () => {
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(2, 0),
                    takerAssetAmount: toBaseUnitAmount(1, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
            ];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const expectedTransferAmounts = [
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(2, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                },
            ];
            await matchOrderTester.batchMatchOrdersAndAssertEffectsAsync(
                {
                    leftOrders,
                    rightOrders,
                    leftOrdersTakerAssetFilledAmounts: [ZERO],
                    rightOrdersTakerAssetFilledAmounts: [ZERO],
                },
                takerAddress,
                [[0, 0]],
                expectedTransferAmounts,
                false,
            );
        });
        it('Should correctly match a partial fill', async () => {
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(4, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
            ];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const expectedTransferAmounts = [
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(2, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(50, 16), // 50%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(50, 16), // 50%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                },
            ];
            await matchOrderTester.batchMatchOrdersAndAssertEffectsAsync(
                {
                    leftOrders,
                    rightOrders,
                    leftOrdersTakerAssetFilledAmounts: [ZERO],
                    rightOrdersTakerAssetFilledAmounts: [ZERO],
                },
                takerAddress,
                [[0, 0]],
                expectedTransferAmounts,
                false,
            );
        });
        it('should correctly match two left orders to one complementary right order', async () => {
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(2, 0),
                    takerAssetAmount: toBaseUnitAmount(1, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(2, 0),
                    takerAssetAmount: toBaseUnitAmount(1, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
            ];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(2, 0),
                    takerAssetAmount: toBaseUnitAmount(4, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const expectedTransferAmounts = [
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(2, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Right Maker
                    leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 0),
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(50, 16), // 50%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 50%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(50, 16), // 50%
                },
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(2, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 50%
                    // Right Maker
                    leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(2, 0),
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(50, 16), // 50%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 50%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(50, 16), // 50%
                },
            ];
            await matchOrderTester.batchMatchOrdersAndAssertEffectsAsync(
                {
                    leftOrders,
                    rightOrders,
                    leftOrdersTakerAssetFilledAmounts: [ZERO, ZERO],
                    rightOrdersTakerAssetFilledAmounts: [ZERO],
                },
                takerAddress,
                [[0, 0], [1, 0]],
                expectedTransferAmounts,
                false,
            );
        });
        it('should correctly match one left order to two complementary right orders', async () => {
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(4, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
            ];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const expectedTransferAmounts = [
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(2, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(50, 16), // 50%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(50, 16), // 50%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                },
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(2, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(50, 16), // 50%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(50, 16), // 50%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                },
            ];
            await matchOrderTester.batchMatchOrdersAndAssertEffectsAsync(
                {
                    leftOrders,
                    rightOrders,
                    leftOrdersTakerAssetFilledAmounts: [ZERO],
                    rightOrdersTakerAssetFilledAmounts: [ZERO, ZERO],
                },
                takerAddress,
                [[0, 0], [0, 1]],
                expectedTransferAmounts,
                false,
            );
        });
        it('should correctly match one left order to two right orders, where the last should not be touched', async () => {
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(2, 0),
                    takerAssetAmount: toBaseUnitAmount(1, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
            ];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const expectedTransferAmounts = [
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(2, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                },
            ];
            await matchOrderTester.batchMatchOrdersAndAssertEffectsAsync(
                {
                    leftOrders,
                    rightOrders,
                    leftOrdersTakerAssetFilledAmounts: [ZERO],
                    rightOrdersTakerAssetFilledAmounts: [ZERO, ZERO],
                },
                takerAddress,
                [[0, 0]],
                expectedTransferAmounts,
                false,
            );
        });
        it('should have three order matchings with only two left orders and two right orders', async () => {
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(4, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(2, 0),
                    takerAssetAmount: toBaseUnitAmount(1, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
            ];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(2, 0),
                    takerAssetAmount: toBaseUnitAmount(4, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const expectedTransferAmounts = [
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(2, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(50, 16), // 50%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(50, 16), // 50%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                },
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(2, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(50, 16), // 50%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(50, 16), // 50%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(50, 16), // 50%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(50, 16), // 50%
                },
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(2, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(50, 16), // 50%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(50, 16), // 50%
                },
            ];
            await matchOrderTester.batchMatchOrdersAndAssertEffectsAsync(
                {
                    leftOrders,
                    rightOrders,
                    leftOrdersTakerAssetFilledAmounts: [ZERO, ZERO],
                    rightOrdersTakerAssetFilledAmounts: [ZERO, ZERO],
                },
                takerAddress,
                [[0, 0], [0, 1], [1, 1]],
                expectedTransferAmounts,
                false,
            );
        });
    });
    describe('batchMatchOrdersWithMaximalFill', () => {
        it('should fully fill the the right order and pay the profit denominated in the left maker asset', async () => {
            // Create orders to match
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(17, 0),
                    takerAssetAmount: toBaseUnitAmount(98, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
            ];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(75, 0),
                    takerAssetAmount: toBaseUnitAmount(13, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const expectedTransferAmounts = [
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(13, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(new BigNumber('76.4705882352941176'), 16), // 76.47%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(75, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('76.5306122448979591'), 16), // 76.53%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                },
            ];
            await matchOrderTester.batchMatchOrdersAndAssertEffectsAsync(
                {
                    leftOrders,
                    rightOrders,
                    leftOrdersTakerAssetFilledAmounts: [ZERO],
                    rightOrdersTakerAssetFilledAmounts: [ZERO],
                },
                takerAddress,
                [[0, 0]],
                expectedTransferAmounts,
                true,
            );
        });
        it('Should transfer correct amounts when left order is fully filled', async () => {
            // Create orders to match
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(15, 0),
                    takerAssetAmount: toBaseUnitAmount(90, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
            ];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(196, 0),
                    takerAssetAmount: toBaseUnitAmount(28, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            // Match signedOrderLeft with signedOrderRight
            // Note that the right maker received a slightly better purchase price.
            // This is intentional; see note in MixinMatchOrders.calculateMatchedFillResults.
            // Because the right maker received a slightly more favorable buy price, the fee
            // paid by the right taker is slightly higher than that paid by the right maker.
            // Fees can be thought of as a tax paid by the seller, derived from the sale price.
            const expectedTransferAmounts = [
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(15, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    rightMakerAssetBoughtByLeftMakerAmount: toBaseUnitAmount(90, 0),
                    // Right Maker
                    leftMakerAssetBoughtByRightMakerAmount: toBaseUnitAmount(15, 0),
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(105, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(
                        new BigNumber('53.5714285714285714'),
                        16,
                    ), // 53.57%
                    // Taker
                    rightMakerAssetReceivedByTakerAmount: toBaseUnitAmount(15, 0),
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('53.5714285714285714'), 16), // 53.57%
                },
            ];
            await matchOrderTester.batchMatchOrdersAndAssertEffectsAsync(
                {
                    leftOrders,
                    rightOrders,
                    leftOrdersTakerAssetFilledAmounts: [ZERO],
                    rightOrdersTakerAssetFilledAmounts: [ZERO],
                },
                takerAddress,
                [[0, 0]],
                expectedTransferAmounts,
                true,
            );
        });
        it('should correctly match one left order to two right orders, where the last should not be touched', async () => {
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(2, 0),
                    takerAssetAmount: toBaseUnitAmount(1, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
            ];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(1, 0),
                    takerAssetAmount: toBaseUnitAmount(2, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const expectedTransferAmounts = [
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(2, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                },
            ];
            await matchOrderTester.batchMatchOrdersAndAssertEffectsAsync(
                {
                    leftOrders,
                    rightOrders,
                    leftOrdersTakerAssetFilledAmounts: [ZERO],
                    rightOrdersTakerAssetFilledAmounts: [ZERO, ZERO],
                },
                takerAddress,
                [[0, 0]],
                expectedTransferAmounts,
                true,
            );
        });
        it('should correctly fill all four orders in three matches', async () => {
            const leftOrders = [
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(2, 0),
                    takerAssetAmount: toBaseUnitAmount(1, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
                await orderFactoryLeft.newSignedOrderAsync({
                    makerAddress: makerAddressLeft,
                    makerAssetAmount: toBaseUnitAmount(72, 0),
                    takerAssetAmount: toBaseUnitAmount(36, 0),
                    feeRecipientAddress: feeRecipientAddressLeft,
                }),
            ];
            const rightOrders = [
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(15, 0),
                    takerAssetAmount: toBaseUnitAmount(30, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
                await orderFactoryRight.newSignedOrderAsync({
                    makerAddress: makerAddressRight,
                    makerAssetAmount: toBaseUnitAmount(22, 0),
                    takerAssetAmount: toBaseUnitAmount(44, 0),
                    feeRecipientAddress: feeRecipientAddressRight,
                }),
            ];
            const expectedTransferAmounts = [
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(2, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(1, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(new BigNumber('6.6666666666666666'), 16), // 6.66%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('6.6666666666666666'), 16), // 6.66%
                },
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(28, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(new BigNumber('38.8888888888888888'), 16), // 38.88%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(14, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(
                        new BigNumber('93.3333333333333333'),
                        16,
                    ), // 93.33%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('38.8888888888888888'), 16), // 38.88%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('93.3333333333333333'), 16), // 93.33%
                },
                {
                    // Left Maker
                    leftMakerAssetSoldByLeftMakerAmount: toBaseUnitAmount(44, 0),
                    leftMakerFeeAssetPaidByLeftMakerAmount: toBaseUnitAmount(new BigNumber('61.1111111111111111'), 16), // 61.11%
                    // Right Maker
                    rightMakerAssetSoldByRightMakerAmount: toBaseUnitAmount(22, 0),
                    rightMakerFeeAssetPaidByRightMakerAmount: toBaseUnitAmount(100, 16), // 100%
                    // Taker
                    leftTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(new BigNumber('61.1111111111111111'), 16), // 61.11%
                    rightTakerFeeAssetPaidByTakerAmount: toBaseUnitAmount(100, 16), // 100%
                },
            ];
            await matchOrderTester.batchMatchOrdersAndAssertEffectsAsync(
                {
                    leftOrders,
                    rightOrders,
                    leftOrdersTakerAssetFilledAmounts: [ZERO, ZERO],
                    rightOrdersTakerAssetFilledAmounts: [ZERO, ZERO],
                },
                takerAddress,
                [[0, 0], [1, 0], [1, 1]],
                expectedTransferAmounts,
                true,
            );
        });
    });
    */
});
// tslint:disable-line:max-file-line-count
